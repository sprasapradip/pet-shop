// Booking wizard enhancement. Without JavaScript the same form works as one long page
// (server renders available times via "Check available times", and guests verify by SMS on the next page).
(function () {
  'use strict';
  var form = document.querySelector('[data-booking-form]');
  if (!form) return;

  var csrf = form.querySelector('input[name="_csrf"]').value;
  var steps = Array.prototype.slice.call(form.querySelectorAll('[data-step]'));
  var live = document.querySelector('[data-step-live]');
  var progress = document.querySelectorAll('[data-progress-item]');
  var current = 0;

  var $ = function (sel) { return form.querySelector(sel); };
  var serviceType = function () { var c = $('input[name="serviceType"]:checked'); return c ? c.value : ''; };
  var isGuest = form.getAttribute('data-guest') === '1';

  form.classList.add('js-wizard');
  document.querySelectorAll('[data-nojs-only]').forEach(function (el) { el.hidden = true; });

  function applyServiceRules() {
    var t = serviceType();
    form.querySelectorAll('[data-only]').forEach(function (el) {
      var types = el.getAttribute('data-only').split(',');
      var show = types.indexOf(t) !== -1;
      el.hidden = !show;
      el.querySelectorAll('input, select, textarea').forEach(function (i) { i.disabled = !show; });
    });
    form.querySelectorAll('[data-not]').forEach(function (el) {
      var hide = el.getAttribute('data-not').split(',').indexOf(t) !== -1;
      el.hidden = hide;
      el.querySelectorAll('input, select, textarea').forEach(function (i) { i.disabled = hide; });
    });
  }

  function visibleSteps() {
    return steps.filter(function (s) {
      var only = s.getAttribute('data-step-only');
      return !only || only.split(',').indexOf(serviceType()) !== -1;
    });
  }

  function show(index) {
    var vis = visibleSteps();
    current = Math.max(0, Math.min(index, vis.length - 1));
    steps.forEach(function (s) { s.hidden = true; });
    vis[current].hidden = false;
    progress.forEach(function (p, i) {
      p.classList.toggle('text-brand-800', i <= current);
      p.classList.toggle('font-semibold', i === current);
    });
    if (live) live.textContent = 'Step ' + (current + 1) + ' of ' + vis.length + ': ' + vis[current].getAttribute('data-title');
    var heading = vis[current].querySelector('h2');
    if (heading) { heading.setAttribute('tabindex', '-1'); heading.focus(); }
  }

  function validateStep() {
    var vis = visibleSteps();
    var fields = vis[current].querySelectorAll('input, select, textarea');
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (f.disabled || f.type === 'hidden') continue;
      if (!f.checkValidity()) { f.reportValidity(); return false; }
    }
    if (vis[current].hasAttribute('data-needs-slot') && serviceType() !== 'BOARDING' && !$('input[name="slot"]:checked')) {
      setSlotStatus('Please choose a time.');
      return false;
    }
    if (vis[current].hasAttribute('data-needs-pet') && !$('[name="petId"]:checked') && !($('[name="petSummary"]') || {}).value) {
      var ps = $('[name="petSummary"]');
      if (ps) { ps.setCustomValidity('Tell us about your pet'); ps.reportValidity(); ps.setCustomValidity(''); }
      return false;
    }
    return true;
  }

  form.addEventListener('click', function (e) {
    var t = e.target.closest('[data-next], [data-back]');
    if (!t) return;
    e.preventDefault();
    if (t.hasAttribute('data-next')) { if (validateStep()) { show(current + 1); fillSummary(); } }
    else show(current - 1);
  });

  // ----- Slots -----
  var slotBox = $('[data-slots]');
  var slotStatus = $('[data-slot-status]');
  function setSlotStatus(msg) { if (slotStatus) slotStatus.textContent = msg; }

  function loadSlots() {
    var date = ($('input[name="date"]') || {}).value;
    var t = serviceType();
    if (!slotBox || !date || !t || t === 'BOARDING') return;
    setSlotStatus('Loading available times…');
    slotBox.innerHTML = '';
    fetch('/api/v1/services/' + t + '/slots?date=' + encodeURIComponent(date), { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        var slots = j.data || [];
        if (!slots.length) { setSlotStatus('No times left on this day. Please choose another date.'); return; }
        setSlotStatus(slots.length + ' times available.');
        slots.forEach(function (s, i) {
          var id = 'slot-' + i;
          var wrap = document.createElement('div');
          var input = document.createElement('input');
          input.type = 'radio'; input.name = 'slot'; input.value = s.time; input.id = id; input.className = 'slot-input sr-only'; input.required = true;
          var label = document.createElement('label');
          label.htmlFor = id; label.className = 'slot-label';
          label.textContent = s.time;
          var small = document.createElement('span');
          small.className = 'text-[11px] font-normal opacity-75';
          small.textContent = s.available + ' left';
          label.appendChild(small);
          wrap.appendChild(input); wrap.appendChild(label);
          slotBox.appendChild(wrap);
        });
      })
      .catch(function () { setSlotStatus('Could not load times. Please try again.'); });
  }

  // ----- Boarding availability -----
  var boardBox = $('[data-boarding-status]');
  function loadBoarding() {
    var from = ($('input[name="date"]') || {}).value;
    var to = ($('input[name="endDate"]') || {}).value;
    if (!boardBox || serviceType() !== 'BOARDING' || !from || !to) return;
    if (to <= from) { boardBox.textContent = 'Check out must be after check in.'; return; }
    boardBox.textContent = 'Checking free kennels…';
    fetch('/api/v1/boarding/availability?from=' + from + '&to=' + to, { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j.error) { boardBox.textContent = j.error.message; return; }
        var d = j.data;
        if (!d.free) { boardBox.textContent = 'Sorry, all kennels are booked for these dates.'; return; }
        boardBox.textContent = d.nights + ' night' + (d.nights > 1 ? 's' : '') + ': ' + d.free + ' kennel' + (d.free > 1 ? 's' : '') +
          ' free. ' + d.sizes.map(function (s) { return s.size.toLowerCase() + ' from Rs ' + Math.round(s.dailyRate / 100).toLocaleString('en-IN') + '/night'; }).join(', ') + '.';
      });
  }

  form.addEventListener('change', function (e) {
    var n = e.target.name;
    if (n === 'serviceType') { applyServiceRules(); loadSlots(); loadBoarding(); }
    if (n === 'date') { loadSlots(); loadBoarding(); }
    if (n === 'endDate') loadBoarding();
    if (n === 'petId') {
      var ps = $('[name="petSummary"]');
      if (ps) ps.required = !$('[name="petId"]:checked') || $('[name="petId"]:checked').value === '';
    }
  });

  // ----- Guest OTP -----
  var otpBox = $('[data-otp]');
  if (otpBox && isGuest) {
    var sendBtn = otpBox.querySelector('[data-otp-send]');
    var verifyBtn = otpBox.querySelector('[data-otp-verify]');
    var codeInput = otpBox.querySelector('[data-otp-code]');
    var status = otpBox.querySelector('[data-otp-status]');
    var phoneInput = $('[name="contactPhone"]');
    var post = function (url, body) {
      return fetch(url, {
        method: 'POST', credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf, Accept: 'application/json' },
        body: JSON.stringify(body),
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); });
    };
    otpBox.hidden = false;
    sendBtn.addEventListener('click', function () {
      if (!phoneInput.checkValidity()) { phoneInput.reportValidity(); return; }
      sendBtn.disabled = true;
      status.textContent = 'Sending code…';
      post('/api/v1/otp', { phone: phoneInput.value, purpose: 'booking' }).then(function (res) {
        sendBtn.disabled = false;
        if (res.ok) { status.textContent = 'We sent a 6 digit code to ' + res.body.data.phone + '.'; codeInput.parentElement.hidden = false; codeInput.focus(); }
        else status.textContent = res.body.error.message;
      });
    });
    verifyBtn.addEventListener('click', function () {
      verifyBtn.disabled = true;
      post('/api/v1/otp/verify', { phone: phoneInput.value, code: codeInput.value, purpose: 'booking' }).then(function (res) {
        verifyBtn.disabled = false;
        if (res.ok) {
          status.textContent = 'Phone verified.';
          form.setAttribute('data-verified', res.body.data.phone);
          codeInput.parentElement.hidden = true;
          sendBtn.hidden = true;
        } else status.textContent = res.body.error.message;
      });
    });
  }

  // ----- Summary -----
  function fillSummary() {
    var box = $('[data-summary]');
    if (!box) return;
    var svc = $('input[name="serviceType"]:checked');
    var lines = [];
    if (svc) lines.push(['Service', svc.getAttribute('data-name')]);
    var date = ($('input[name="date"]') || {}).value;
    if (serviceType() === 'BOARDING') lines.push(['Dates', date + ' to ' + (($('input[name="endDate"]') || {}).value || '')]);
    else { var slot = $('input[name="slot"]:checked'); lines.push(['When', date + (slot ? ' at ' + slot.value : '')]); }
    var pet = $('[name="petId"]:checked');
    lines.push(['Pet', pet && pet.value ? pet.getAttribute('data-name') : (($('[name="petSummary"]') || {}).value || '')]);
    var addr = $('[name="addressText"]');
    if (addr && !addr.disabled && addr.value) lines.push(['Address', addr.value + ', ' + (($('[name="district"]') || {}).value || '')]);
    lines.push(['Contact', (($('[name="contactName"]') || {}).value || '') + ', ' + (($('[name="contactPhone"]') || {}).value || '')]);
    box.innerHTML = '';
    lines.forEach(function (l) {
      var dt = document.createElement('dt'); dt.className = 'text-stone-500'; dt.textContent = l[0];
      var dd = document.createElement('dd'); dd.className = 'font-medium'; dd.textContent = l[1];
      box.appendChild(dt); box.appendChild(dd);
    });
  }

  applyServiceRules();
  var firstError = form.querySelector('[aria-invalid="true"]');
  if (firstError) {
    var vis = visibleSteps();
    var idx = vis.findIndex(function (s) { return s.contains(firstError); });
    show(idx >= 0 ? idx : 0);
  } else {
    show(form.getAttribute('data-start-step') ? Number(form.getAttribute('data-start-step')) : 0);
  }
  loadSlots();
  loadBoarding();
})();

// The Everest Kennel: small progressive enhancements. Every feature also works without JavaScript.
(function () {
  'use strict';

  var csrf = function () {
    var el = document.querySelector('input[name="_csrf"]');
    return el ? el.value : '';
  };

  // Mobile navigation toggle
  var toggle = document.querySelector('[data-nav-toggle]');
  var mobileNav = document.getElementById('mobile-nav');
  if (toggle && mobileNav) {
    toggle.addEventListener('click', function () {
      var open = mobileNav.classList.toggle('hidden') === false;
      toggle.setAttribute('aria-expanded', String(open));
    });
  }

  // <select data-submit-on-change> submits its form (CSP forbids inline handlers)
  document.querySelectorAll('[data-submit-on-change]').forEach(function (el) {
    el.addEventListener('change', function () { el.form.submit(); });
  });

  // Confirm dangerous actions: <form data-confirm="Are you sure?">
  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (form.matches && form.matches('[data-confirm]') && !window.confirm(form.getAttribute('data-confirm'))) {
      e.preventDefault();
    }
  });

  // Add to cart without a page reload (falls back to normal POST)
  function toast(message, ok) {
    var t = document.createElement('div');
    t.setAttribute('role', 'status');
    t.className = 'fixed z-50 left-1/2 -translate-x-1/2 bottom-20 md:bottom-6 px-4 py-3 rounded-xl shadow-lg text-sm font-medium ' +
      (ok ? 'bg-brand-800 text-white' : 'bg-red-700 text-white');
    t.textContent = message;
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 3500);
  }

  function setCartCount(n) {
    document.querySelectorAll('[data-cart-count]').forEach(function (el) {
      el.textContent = String(n);
      el.classList.toggle('hidden', !n);
    });
  }

  document.querySelectorAll('form[data-add-to-cart]').forEach(function (form) {
    form.addEventListener('submit', function (e) {
      if (!window.fetch) return;
      e.preventDefault();
      var data = new FormData(form);
      var btn = form.querySelector('button[type="submit"], button:not([type])');
      if (btn) btn.disabled = true;
      fetch('/api/v1/cart/items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': data.get('_csrf') || csrf(), Accept: 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ variantId: Number(data.get('variantId')), quantity: Number(data.get('quantity') || 1) }),
      })
        .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
        .then(function (res) {
          if (res.ok) {
            setCartCount(res.body.data.count);
            toast('Added to cart ✓  View cart →', true);
          } else {
            toast((res.body.error && res.body.error.message) || 'Could not add to cart', false);
          }
        })
        .catch(function () { form.submit(); })
        .finally(function () { if (btn) btn.disabled = false; });
    });
  });

  // Product page: variant picker updates price, stock and hidden variantId
  var picker = document.querySelector('[data-variant-picker]');
  if (picker) {
    var update = function () {
      var opt = picker.querySelector('input:checked');
      if (!opt) return;
      document.querySelectorAll('[data-variant-field]').forEach(function (el) { el.value = opt.value; });
      var price = document.querySelector('[data-price]');
      var compare = document.querySelector('[data-compare]');
      var stock = document.querySelector('[data-stock]');
      if (price) price.textContent = opt.getAttribute('data-price-label');
      if (compare) {
        compare.textContent = opt.getAttribute('data-compare-label') || '';
        compare.classList.toggle('hidden', !opt.getAttribute('data-compare-label'));
      }
      if (stock) {
        stock.textContent = opt.getAttribute('data-stock-label');
        stock.className = 'badge ' + opt.getAttribute('data-stock-class');
      }
      var out = opt.getAttribute('data-out') === '1';
      document.querySelectorAll('[data-when-in]').forEach(function (el) { el.hidden = out; });
      document.querySelectorAll('[data-when-out]').forEach(function (el) { el.hidden = !out; });
    };
    picker.addEventListener('change', update);
    update();
  }

  // Recently viewed products (client side only)
  var rv = document.querySelector('[data-recently-viewed]');
  var current = document.querySelector('[data-product-record]');
  try {
    var key = 'ek.recent';
    var list = JSON.parse(localStorage.getItem(key) || '[]');
    if (current) {
      var rec = JSON.parse(current.getAttribute('data-product-record'));
      list = [rec].concat(list.filter(function (p) { return p.slug !== rec.slug; })).slice(0, 8);
      localStorage.setItem(key, JSON.stringify(list));
    }
    if (rv) {
      var others = list.filter(function (p) { return !current || p.slug !== JSON.parse(current.getAttribute('data-product-record')).slug; }).slice(0, 4);
      if (others.length) {
        var grid = rv.querySelector('[data-grid]');
        others.forEach(function (p) {
          var a = document.createElement('a');
          a.href = '/shop/product/' + encodeURIComponent(p.slug);
          a.className = 'card p-3 flex gap-3 items-center hover:shadow-md';
          var img = document.createElement('img');
          img.src = p.image || '/assets/img/placeholder.svg';
          img.alt = '';
          img.width = 56; img.height = 56; img.loading = 'lazy';
          img.className = 'w-14 h-14 rounded-lg object-cover bg-stone-100';
          var span = document.createElement('span');
          span.className = 'text-sm font-medium line-clamp-2';
          span.textContent = p.name;
          a.appendChild(img); a.appendChild(span);
          grid.appendChild(a);
        });
        rv.hidden = false;
      }
    }
  } catch (err) { /* storage unavailable: feature silently off */ }

  // Click-to-load Google Map (privacy and performance)
  document.querySelectorAll('[data-map-src]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var iframe = document.createElement('iframe');
      iframe.src = btn.getAttribute('data-map-src');
      iframe.title = 'Map to The Everest Kennel';
      iframe.loading = 'lazy';
      iframe.referrerPolicy = 'no-referrer-when-downgrade';
      iframe.className = 'w-full h-full border-0 rounded-2xl';
      btn.replaceWith(iframe);
    });
  });

  // Checkout: delivery fee updates with the zone
  var zone = document.querySelector('[data-zone-select]');
  if (zone && window.fetch) {
    zone.addEventListener('change', function () {
      var checked = document.querySelector('[data-zone-select] input:checked');
      if (!checked) return;
      fetch('/api/v1/checkout/quote?zone=' + encodeURIComponent(checked.value), { credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          var fmt = function (p) { return 'Rs ' + Math.round(p / 100).toLocaleString('en-IN'); };
          var d = document.querySelector('[data-delivery]');
          var t = document.querySelector('[data-total]');
          if (d) d.textContent = j.data.deliveryPaisa ? fmt(j.data.deliveryPaisa) : 'Free';
          if (t) t.textContent = fmt(j.data.totalPaisa);
        });
    });
  }

  document.querySelectorAll('[data-print]').forEach(function (b) {
    b.addEventListener('click', function () { window.print(); });
  });

  // Auto-submit payment redirect form (eSewa)
  var auto = document.querySelector('form[data-autosubmit]');
  if (auto) setTimeout(function () { auto.submit(); }, 600);

  // Image gallery on pet/product pages
  document.querySelectorAll('[data-gallery]').forEach(function (g) {
    var main = g.querySelector('[data-gallery-main]');
    g.querySelectorAll('[data-gallery-thumb]').forEach(function (t) {
      t.addEventListener('click', function () {
        main.src = t.getAttribute('data-full');
        main.srcset = t.getAttribute('data-srcset') || '';
        main.alt = t.getAttribute('data-alt') || '';
        g.querySelectorAll('[data-gallery-thumb]').forEach(function (x) { x.setAttribute('aria-current', 'false'); });
        t.setAttribute('aria-current', 'true');
      });
    });
  });

  // "Use my location" for report/booking forms
  document.querySelectorAll('[data-geolocate]').forEach(function (btn) {
    if (!navigator.geolocation) { btn.hidden = true; return; }
    btn.addEventListener('click', function () {
      var status = document.querySelector(btn.getAttribute('data-status'));
      if (status) status.textContent = 'Getting your location…';
      navigator.geolocation.getCurrentPosition(function (pos) {
        document.querySelector('[name="latitude"]').value = pos.coords.latitude.toFixed(7);
        document.querySelector('[name="longitude"]').value = pos.coords.longitude.toFixed(7);
        if (status) status.textContent = 'Location added ✓';
      }, function () {
        if (status) status.textContent = 'Could not get location. Please describe the place instead.';
      }, { enableHighAccuracy: true, timeout: 10000 });
    });
  });

  // Admin: add another variant row
  var addRow = document.querySelector('[data-add-variant]');
  if (addRow) {
    addRow.addEventListener('click', function () {
      var body = document.querySelector('[data-variant-rows]');
      var tpl = document.querySelector('[data-variant-template]');
      var idx = body.querySelectorAll('tr').length;
      var html = tpl.innerHTML.replace(/__INDEX__/g, String(idx));
      body.insertAdjacentHTML('beforeend', html);
    });
  }
})();

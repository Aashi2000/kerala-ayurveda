/**
 * Kerala Ayurveda — PDP experience
 *
 * Progressive enhancement over the markup in ayurveda-product-guide.liquid.
 * Nothing here is required for the page to function: the product form submits
 * natively without it, and the advisor is the only piece that genuinely needs JS
 * (it hides its own submit button if it can't run).
 *
 * No dependencies, no build step — it ships as a theme asset.
 */
(function () {
  'use strict';

  var REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function $(selector, scope) {
    return (scope || document).querySelector(selector);
  }
  function $$(selector, scope) {
    return Array.prototype.slice.call((scope || document).querySelectorAll(selector));
  }
  function escapeHtml(value) {
    var div = document.createElement('div');
    div.textContent = value == null ? '' : String(value);
    return div.innerHTML;
  }

  /* ------------------------------------------------------------------ *
   * Media gallery
   * ------------------------------------------------------------------ */
  function initGallery(root) {
    var main = $('[data-ka-media-main]', root);
    var thumbs = $$('[data-ka-thumb]', root);
    if (!main || thumbs.length === 0) return;

    thumbs.forEach(function (thumb) {
      thumb.addEventListener('click', function () {
        var source = $('img', thumb);
        var target = $('img', main);
        if (!source || !target) return;

        thumbs.forEach(function (t) {
          t.classList.toggle('is-active', t === thumb);
        });

        // Cross-fade rather than snap: the swap reads as intentional.
        if (REDUCED_MOTION) {
          target.src = source.src.replace(/width=\d+/, 'width=1400');
          target.srcset = '';
          return;
        }
        main.classList.add('is-swapping');
        window.setTimeout(function () {
          target.src = source.src.replace(/width=\d+/, 'width=1400');
          target.srcset = '';
          main.classList.remove('is-swapping');
        }, 140);
      });
    });
  }

  /* ------------------------------------------------------------------ *
   * Variant selection
   * ------------------------------------------------------------------ */
  function initVariants(root) {
    var dataEl = $('[data-ka-variants]', root);
    if (!dataEl) return;

    var variants;
    try {
      variants = JSON.parse(dataEl.textContent);
    } catch (error) {
      // A malformed payload must not take the buy button down with it.
      console.warn('[ka] could not parse variant data', error);
      return;
    }

    var inputs = $$('[data-ka-option-input]', root);
    if (inputs.length === 0) return;

    var idField = $('[data-ka-variant-id]', root);
    var priceCurrent = $('[data-ka-price-current]', root);
    var priceWas = $('[data-ka-price-was]', root);
    var priceUnit = $('[data-ka-price-unit]', root);
    var atc = $('[data-ka-atc]', root);
    var atcLabel = $('[data-ka-atc-label]', root);
    var priceBox = $('[data-ka-price]', root);
    var defaultLabel = atcLabel ? atcLabel.textContent.trim() : 'Add to cart';

    function selectedOptions() {
      var chosen = [];
      inputs.forEach(function (input) {
        if (input.checked) chosen[Number(input.dataset.optionPosition) - 1] = input.value;
      });
      return chosen;
    }

    function findVariant(options) {
      return variants.find(function (variant) {
        return variant.options.every(function (value, index) {
          return value === options[index];
        });
      });
    }

    /**
     * Grey out option values that lead nowhere, holding the other options fixed.
     * Without this a shopper can assemble a combination that doesn't exist and
     * only find out when the button dies.
     */
    function markUnavailable(options) {
      inputs.forEach(function (input) {
        var probe = options.slice();
        probe[Number(input.dataset.optionPosition) - 1] = input.value;
        var match = findVariant(probe);
        var label = input.closest('.ka-swatch');
        if (label) {
          label.classList.toggle('is-unavailable', !match || !match.available);
        }
      });
    }

    function render() {
      var options = selectedOptions();
      var variant = findVariant(options);

      markUnavailable(options);

      $$('[data-ka-option-selected]', root).forEach(function (el) {
        var value = options[Number(el.dataset.kaOptionSelected)];
        if (value) el.textContent = value;
      });

      if (!variant) {
        if (atc) atc.disabled = true;
        if (atcLabel) atcLabel.textContent = 'Unavailable';
        return;
      }

      if (idField) idField.value = variant.id;

      if (priceCurrent && priceCurrent.textContent !== variant.price) {
        priceCurrent.textContent = variant.price;
        if (priceBox && !REDUCED_MOTION) {
          priceBox.classList.remove('is-updated');
          void priceBox.offsetWidth; // restart the animation
          priceBox.classList.add('is-updated');
        }
      }

      if (priceWas) {
        priceWas.textContent = variant.compareAtPrice || '';
        priceWas.hidden = !variant.compareAtPrice;
      }
      if (priceUnit) priceUnit.textContent = variant.unitPrice || '';

      if (atc) atc.disabled = !variant.available;
      if (atcLabel) atcLabel.textContent = variant.available ? defaultLabel : 'Sold out';

      // Keep the URL shareable, the way a native Shopify PDP does.
      if (window.history.replaceState) {
        var url = new URL(window.location.href);
        url.searchParams.set('variant', variant.id);
        window.history.replaceState({}, '', url.toString());
      }
    }

    inputs.forEach(function (input) {
      input.addEventListener('change', render);
    });
    render();
  }

  /* ------------------------------------------------------------------ *
   * Quantity
   * ------------------------------------------------------------------ */
  function initQuantity(root) {
    var input = $('[data-ka-qty-input]', root);
    if (!input) return;

    function nudge(delta) {
      var next = Math.max(1, (parseInt(input.value, 10) || 1) + delta);
      input.value = next;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    var down = $('[data-ka-qty-down]', root);
    var up = $('[data-ka-qty-up]', root);
    if (down) down.addEventListener('click', function () { nudge(-1); });
    if (up) up.addEventListener('click', function () { nudge(1); });

    input.addEventListener('blur', function () {
      if (!input.value || parseInt(input.value, 10) < 1) input.value = 1;
    });
  }

  /* ------------------------------------------------------------------ *
   * Add to cart
   * ------------------------------------------------------------------ */
  function initAddToCart(root) {
    var form = $('[data-ka-atc]', root) ? $('#ka-form', root) || $('form', root) : null;
    var button = $('[data-ka-atc]', root);
    var label = $('[data-ka-atc-label]', root);
    var status = $('[data-ka-atc-status]', root);
    if (!form || !button) return;

    var defaultLabel = label ? label.textContent.trim() : 'Add to cart';
    var resetTimer;

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      window.clearTimeout(resetTimer);

      button.classList.add('is-loading');
      button.disabled = true;
      if (status) {
        status.textContent = '';
        status.className = 'ka-form__status';
      }

      fetch('/cart/add.js', {
        method: 'POST',
        headers: { Accept: 'application/json' },
        body: new FormData(form),
      })
        .then(function (response) {
          return response.json().then(function (body) {
            if (!response.ok) throw new Error(body.description || body.message || 'Add to cart failed');
            return body;
          });
        })
        .then(function () {
          button.classList.remove('is-loading');
          button.classList.add('is-added');
          if (label) label.textContent = 'Added';
          if (status) {
            status.textContent = 'Added to your cart.';
            status.className = 'ka-form__status is-success';
          }
          // Let the theme's cart drawer / bubble update itself.
          document.dispatchEvent(new CustomEvent('cart:refresh', { bubbles: true }));

          resetTimer = window.setTimeout(function () {
            button.classList.remove('is-added');
            button.disabled = false;
            if (label) label.textContent = defaultLabel;
          }, 2000);
        })
        .catch(function (error) {
          button.classList.remove('is-loading');
          button.disabled = false;
          if (label) label.textContent = defaultLabel;
          if (status) {
            status.textContent = error.message || "That didn't go through. Please try again.";
            status.className = 'ka-form__status is-error';
          }
        });
    });
  }

  /* ------------------------------------------------------------------ *
   * Advisor
   * ------------------------------------------------------------------ */
  function initAdvisor(root) {
    var advisor = $('[data-ka-advisor]', root);
    if (!advisor) return;

    var form = $('[data-ka-advisor-form]', advisor);
    var result = $('[data-ka-result]', advisor);
    var submit = $('[data-ka-advisor-submit]', advisor);
    var endpoint = advisor.dataset.endpoint;
    var consultUrl = advisor.dataset.consultUrl;
    if (!form || !result || !submit) return;

    if (!endpoint) {
      // Misconfigured in the Theme Editor — say so rather than fail on click.
      advisor.hidden = true;
      console.warn('[ka] advisor has no endpoint configured');
      return;
    }

    function clearErrors() {
      $$('[data-ka-error]', advisor).forEach(function (el) {
        el.textContent = '';
      });
      $$('.ka-q', advisor).forEach(function (el) {
        el.classList.remove('is-invalid');
      });
    }

    function showError(field, message) {
      var el = $('[data-ka-error="' + field + '"]', advisor);
      if (el) {
        el.textContent = message;
        var question = el.closest('.ka-q');
        if (question) question.classList.add('is-invalid');
      }
    }

    function collect() {
      var data = new FormData(form);
      var goals = data.getAll('goals');
      var cautions = data.getAll('cautions');
      var timing = data.get('timing');
      return {
        goals: goals,
        experience: data.get('experience'),
        timing: timing || undefined,
        cautions: cautions,
      };
    }

    /** Mirrors the server's rules so the shopper isn't billed a round trip for a blank form. */
    function validate(payload) {
      clearErrors();
      var valid = true;
      if (payload.goals.length === 0) {
        showError('goals', 'Pick at least one, so we have something to work with.');
        valid = false;
      }
      if (!payload.experience) {
        showError('experience', 'Let us know where you are starting from.');
        valid = false;
      }
      return valid;
    }

    function renderSkeleton() {
      result.innerHTML =
        '<div class="ka-result__card ka-skeleton">' +
        '<div class="ka-skeleton__line" style="width:40%"></div>' +
        '<div class="ka-skeleton__line" style="width:90%"></div>' +
        '<div class="ka-skeleton__line" style="width:75%"></div>' +
        '<div class="ka-skeleton__box"></div>' +
        '</div>';
      result.classList.add('is-visible');
    }

    function renderError(message) {
      result.innerHTML =
        '<div class="ka-result__card ka-result__card--error" role="alert">' +
        '<p class="ka-result__errorTitle">We couldn\'t build your routine</p>' +
        '<p>' + escapeHtml(message) + '</p>' +
        '<button type="button" class="ka-result__retry" data-ka-retry>Try again</button>' +
        '</div>';
      result.classList.add('is-visible');
      var retry = $('[data-ka-retry]', result);
      if (retry) {
        retry.addEventListener('click', function () {
          form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
        });
      }
    }

    function renderRecommendation(payload) {
      var rec = payload.recommendation;

      var consult = '';
      if (rec.consultRequired) {
        consult =
          '<div class="ka-consult">' +
          '<p class="ka-consult__title">Worth a conversation first</p>' +
          '<p>' + escapeHtml(rec.cautionNotes[0] || '') + '</p>' +
          (consultUrl
            ? '<a class="ka-consult__link" href="' + escapeHtml(consultUrl) + '">Speak to a practitioner</a>'
            : '') +
          '</div>';
      }

      var notes =
        rec.cautionNotes.length && !rec.consultRequired
          ? '<ul class="ka-notes" role="list">' +
            rec.cautionNotes
              .map(function (note) {
                return '<li>' + escapeHtml(note) + '</li>';
              })
              .join('') +
            '</ul>'
          : '';

      var routine = rec.routine
        .map(function (step, index) {
          return (
            '<li class="ka-routine__step" style="--i:' + index + '">' +
            '<span class="ka-routine__when">' + escapeHtml(step.label) + '</span>' +
            '<span class="ka-routine__what">' + escapeHtml(step.detail) + '</span>' +
            '</li>'
          );
        })
        .join('');

      var alternate = rec.alternatePack
        ? '<p class="ka-result__alt">Also considered: <strong>' +
          escapeHtml(rec.alternatePack.label) +
          '</strong> — ' +
          escapeHtml(String(rec.alternatePack.days)) +
          ' days at ₹' +
          escapeHtml(String(rec.alternatePack.pricePerDay)) +
          '/day.</p>'
        : '';

      result.innerHTML =
        '<div class="ka-result__card">' +
        consult +
        '<div class="ka-result__head">' +
        '<p class="ka-result__eyebrow">' + escapeHtml(rec.headline) + '</p>' +
        '<span class="ka-confidence ka-confidence--' + escapeHtml(rec.confidence.label.toLowerCase()) + '">' +
        escapeHtml(rec.confidence.label) + ' match' +
        '</span>' +
        '</div>' +
        '<p class="ka-result__summary">' + escapeHtml(rec.summary) + '</p>' +
        '<div class="ka-pick">' +
        '<div class="ka-pick__row">' +
        '<span class="ka-pick__label">Pack</span>' +
        '<span class="ka-pick__value">' + escapeHtml(rec.pack.label) + ' · ' + escapeHtml(String(rec.pack.count)) + '</span>' +
        '</div>' +
        '<p class="ka-pick__why">' + escapeHtml(rec.pack.reason) + '</p>' +
        '<div class="ka-pick__row">' +
        '<span class="ka-pick__label">Format</span>' +
        '<span class="ka-pick__value">' + escapeHtml(rec.format.label) + '</span>' +
        '</div>' +
        '<p class="ka-pick__why">' + escapeHtml(rec.format.reason) + '</p>' +
        '</div>' +
        '<p class="ka-result__subhead">Your daily routine</p>' +
        '<ol class="ka-routine" role="list">' + routine + '</ol>' +
        '<p class="ka-result__guidance">' + escapeHtml(rec.guidance) + '</p>' +
        notes +
        alternate +
        '</div>';

      result.classList.add('is-visible');
      // Bring the answer into view without yanking the page.
      result.scrollIntoView({ behavior: REDUCED_MOTION ? 'auto' : 'smooth', block: 'nearest' });
    }

    form.addEventListener('submit', function (event) {
      event.preventDefault();
      var payload = collect();
      if (!validate(payload)) {
        var invalid = $('.ka-q.is-invalid', advisor);
        if (invalid) invalid.scrollIntoView({ behavior: REDUCED_MOTION ? 'auto' : 'smooth', block: 'center' });
        return;
      }

      submit.classList.add('is-loading');
      submit.disabled = true;
      renderSkeleton();

      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(function (response) {
          return response.json().then(function (body) {
            if (!response.ok) {
              throw new Error((body.error && body.error.message) || 'Something went wrong.');
            }
            return body;
          });
        })
        .then(renderRecommendation)
        .catch(function (error) {
          renderError(error.message || 'Please check your connection and try again.');
        })
        .finally(function () {
          submit.classList.remove('is-loading');
          submit.disabled = false;
        });
    });

    // Clear a field's error as soon as the shopper answers it.
    form.addEventListener('change', function (event) {
      var question = event.target.closest('.ka-q');
      if (question && question.classList.contains('is-invalid')) {
        question.classList.remove('is-invalid');
        var error = $('[data-ka-error]', question);
        if (error) error.textContent = '';
      }
    });
  }

  function init() {
    $$('[data-ka-pdp]').forEach(function (root) {
      initGallery(root);
      initVariants(root);
      initQuantity(root);
      initAddToCart(root);
      initAdvisor(root);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Re-init when the Theme Editor re-renders the section.
  document.addEventListener('shopify:section:load', init);
})();

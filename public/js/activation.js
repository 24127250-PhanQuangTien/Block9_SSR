(function ()
{
  "use strict";

  const otpInput = document.querySelector("[data-otp-input]");
  const otpTemplate = document.querySelector("[data-otp-template]");
  if (otpInput && otpTemplate)
  {
    const group = otpTemplate.content.firstElementChild.cloneNode(true);
    const digits = [...group.querySelectorAll("[data-otp-digit]")];
    const numbers = value => value.replace(/[^0-9]/g, "").slice(0, digits.length);

    function syncOTP()
    {
      otpInput.value = digits.map(digit => digit.value).join("");
    }

    function fillDigits(value, index)
    {
      const code = numbers(value);
      if (!code) return;
      const start = code.length === digits.length ? 0 : index;
      for (let offset = 0; offset < code.length && start + offset < digits.length; offset++)
      {
        digits[start + offset].value = code[offset];
      }
      syncOTP();
      digits[Math.min(start + code.length, digits.length - 1)].focus();
    }

    digits.forEach((digit, index) =>
    {
      digit.addEventListener("focus", () => digit.select());
      digit.addEventListener("input", () =>
      {
        const code = numbers(digit.value);
        digit.value = "";
        if (code) fillDigits(code, index);
        else syncOTP();
      });
      digit.addEventListener("paste", event =>
      {
        event.preventDefault();
        fillDigits(event.clipboardData.getData("text"), index);
      });
      digit.addEventListener("keydown", event =>
      {
        if (event.key === "Backspace" && !digit.value && index > 0)
        {
          event.preventDefault();
          digits[index - 1].value = "";
          digits[index - 1].focus();
          syncOTP();
        }
        else if (event.key === "ArrowLeft" || event.key === "ArrowRight")
        {
          event.preventDefault();
          const step = event.key === "ArrowLeft" ? -1 : 1;
          digits[Math.max(0, Math.min(index + step, digits.length - 1))].focus();
        }
      });
    });

    // Keep the same native SSR form field and server-side OTP validation.
    const initial = numbers(otpInput.value);
    digits.forEach((digit, index) =>
    {
      digit.value = initial[index] || "";
    });
    otpInput.before(group);
    otpInput.type = "hidden";
    document.querySelector('label[for="otp"]').htmlFor = digits[0].id;
    otpInput.form.addEventListener("submit", syncOTP);
    window.addEventListener("pageshow", syncOTP);
    syncOTP();
  }

  const form = document.querySelector("[data-resend-form]");
  if (!form) return;

  const button = form.querySelector("[data-resend-button]");
  const countdown = form.querySelector("[data-resend-countdown]");
  const status = form.querySelector("[data-resend-status]");
  const waitMs = Math.max(0, Number(form.dataset.resendWaitMs) || 0);
  const deadline = Date.now() + waitMs;
  let submitting = false;
  let timer;

  function update()
  {
    if (submitting) return;
    const seconds = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
    button.disabled = seconds > 0;
    countdown.textContent = seconds > 0 ? `(${seconds}s)` : "";
    if (seconds === 0)
    {
      clearInterval(timer);
      status.textContent = "Bạn có thể yêu cầu gửi lại mã kích hoạt.";
    }
  }

  form.addEventListener("submit", event =>
  {
    if (submitting || Date.now() < deadline)
    {
      event.preventDefault();
      return;
    }
    submitting = true;
    button.disabled = true;
    clearInterval(timer);
    status.textContent = "Đang gửi yêu cầu, vui lòng chờ…";
  });

  // Recompute elapsed time when returning to a background tab or history entry.
  window.addEventListener("pageshow", event =>
  {
    if (event.persisted)
    {
      window.location.reload();
      return;
    }
    submitting = false;
    update();
  });
  document.addEventListener("visibilitychange", update);
  update();
  if (waitMs > 0) timer = setInterval(update, 250);
})();

(function ()
{
  "use strict";

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

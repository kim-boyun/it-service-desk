from __future__ import annotations

from dataclasses import dataclass
import html

from ..core.config import settings
from ..models.ticket import Ticket
from ..models.user import User
from ..models.comment import TicketComment
from .mail_service import MailPayload, enqueue_mail


@dataclass
class MailTarget:
    emp_no: str | None
    email: str | None


def _ticket_link(ticket_id: int, is_admin: bool) -> str:
    base = settings.app_base_url.rstrip("/")
    if is_admin:
        return f"{base}/admin/tickets/{ticket_id}"
    return f"{base}/tickets/{ticket_id}"


def _esc(value: str | None) -> str:
    return html.escape(value or "-")


def _badge(label: str, bg: str, fg: str, border: str) -> str:
    return (
        f"<span style=\"display:inline-block;padding:4px 10px;border-radius:999px;"
        f"background:{bg};color:{fg};border:1px solid {border};font-size:12px;font-weight:600;\">"
        f"{_esc(label)}"
        "</span>"
    )


def _status_badge(status_label: str) -> str:
    styles = {
        "\uc811\uc218": ("#e0f2fe", "#075985", "#bae6fd"),
        "\uc9c4\ud589": ("#fef9c3", "#854d0e", "#fde68a"),
        "\uc644\ub8cc": ("#dcfce7", "#166534", "#bbf7d0"),
        "\uc0ac\uc5c5 \uac80\ud1a0": ("#fef3c7", "#92400e", "#fcd34d"),
    }
    bg, fg, border = styles.get(status_label, ("#f3f4f6", "#374151", "#e5e7eb"))
    return _badge(status_label, bg, fg, border)


def _priority_badge(priority_label: str) -> str:
    styles = {
        "\uae34\uae09": ("#fee2e2", "#b91c1c", "#fecaca"),
        "\ub192\uc74c": ("#ffedd5", "#c2410c", "#fed7aa"),
        "\ubcf4\ud1b5": ("#dbeafe", "#1d4ed8", "#bfdbfe"),
        "\ub0ae\uc74c": ("#e5e7eb", "#374151", "#d1d5db"),
    }
    bg, fg, border = styles.get(priority_label, ("#f3f4f6", "#374151", "#e5e7eb"))
    return _badge(priority_label, bg, fg, border)


def _render_plain(
    *,
    alert_type: str,
    summary: str,
    fields: list[tuple[str, str]],
    status_label: str,
    priority_label: str,
    link_url: str,
) -> str:
    lines: list[str] = []
    lines.append(f"IT DESK | {alert_type}")
    lines.append("")
    lines.append(summary)
    lines.append("")
    lines.append("\uc694\uccad \uc815\ubcf4")
    for label, value in fields:
        lines.append(f"- {label}: {value}")
    lines.append(f"- \uc0c1\ud0dc: {status_label}")
    lines.append(f"- \uc6b0\uc120\uc21c\uc704: {priority_label}")
    lines.append("")
    lines.append(f"\uc694\uccad \uc0c1\uc138 \ubcf4\uae30: {link_url}")
    lines.append("")
    lines.append("\ubcf8 \uba54\uc77c\uc740 \uc2dc\uc2a4\ud15c \uc54c\ub9bc\uc6a9\uc73c\ub85c \ubc1c\uc1a1\ub418\uc5c8\uc2b5\ub2c8\ub2e4.")
    lines.append("\ubc1c\uc2e0 \uc804\uc6a9 \uba54\uc77c\uc785\ub2c8\ub2e4(\ud68c\uc2e0 \ubd88\uac00).")
    return "\n".join(lines)


def _render_html(
    *,
    alert_type: str,
    summary: str,
    fields: list[tuple[str, str]],
    status_label: str,
    priority_label: str,
    link_url: str,
) -> str:
    status_badge = _status_badge(status_label)
    priority_badge = _priority_badge(priority_label)
    rows = "".join(
        f"""
        <tr>
          <td style=\"padding:8px 0;color:#6b7280;font-size:13px;width:140px;\">{_esc(label)}</td>
          <td style=\"padding:8px 0;color:#111827;font-size:14px;font-weight:600;\">{_esc(value)}</td>
        </tr>
        """
        for label, value in fields
    )

    return f"""
<!DOCTYPE html>
<html lang=\"ko\">
  <body style=\"margin:0;padding:24px;background:#ffffff;\">
    <table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"background:#ffffff;\">
      <tr>
        <td align=\"center\">
          <table role=\"presentation\" width=\"680\" cellspacing=\"0\" cellpadding=\"0\" style=\"width:680px;margin:0;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb;\">
            <tr>
              <td style=\"padding:20px 24px;border-bottom:1px solid #e5e7eb;\">
                <div style=\"font-size:12px;color:#6b7280;font-weight:600;letter-spacing:0.04em;\">IT DESK | {_esc(alert_type)}</div>
                <div style=\"margin-top:6px;font-size:20px;font-weight:700;color:#111827;\">{_esc(summary)}</div>
              </td>
            </tr>
            <tr>
              <td style=\"padding:20px 24px;\">
                <div style=\"margin-top:12px;\">
                  {status_badge}
                  <span style=\"display:inline-block;width:8px;\"></span>
                  {priority_badge}
                </div>
                <table role=\"presentation\" width=\"100%\" cellspacing=\"0\" cellpadding=\"0\" style=\"margin-top:16px;border-collapse:collapse;\">
                  {rows}
                </table>
                <div style=\"margin-top:18px;\">
                  <a href=\"{_esc(link_url)}\" style=\"display:inline-block;padding:12px 20px;background:#1d4ed8;color:#ffffff;text-decoration:none;border-radius:8px;font-weight:700;font-size:14px;\">\uc694\uccad \uc0c1\uc138 \ubcf4\uae30</a>
                </div>
              </td>
            </tr>
            <tr>
              <td style=\"padding:16px 24px;border-top:1px solid #e5e7eb;font-size:12px;color:#6b7280;line-height:1.6;\">
                <div>\ubcf8 \uba54\uc77c\uc740 \uc2dc\uc2a4\ud15c \uc54c\ub9bc\uc6a9\uc73c\ub85c \ubc1c\uc1a1\ub418\uc5c8\uc2b5\ub2c8\ub2e4.</div>
                <div>\ubc1c\uc2e0 \uc804\uc6a9 \uba54\uc77c\uc785\ub2c8\ub2e4(\ud68c\uc2e0 \ubd88\uac00).</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
    """.strip()


def _wrap_template(
    *,
    alert_type: str,
    summary: str,
    fields: list[tuple[str, str]],
    status_label: str,
    priority_label: str,
    link_url: str,
) -> tuple[str, str]:
    text = _render_plain(
        alert_type=alert_type,
        summary=summary,
        fields=fields,
        status_label=status_label,
        priority_label=priority_label,
        link_url=link_url,
    )
    html = _render_html(
        alert_type=alert_type,
        summary=summary,
        fields=fields,
        status_label=status_label,
        priority_label=priority_label,
        link_url=link_url,
    )
    return text, html


def enqueue_ticket_mail(
    *,
    event_key: str,
    event_type: str,
    ticket: Ticket,
    recipient: MailTarget,
    subject: str,
    alert_type: str,
    summary: str,
    fields: list[tuple[str, str]],
    status_label: str,
    priority_label: str,
    is_admin_link: bool,
) -> None:
    if not recipient.email:
        return
    link = _ticket_link(ticket.id, is_admin_link)
    text, html = _wrap_template(
        alert_type=alert_type,
        summary=summary,
        fields=fields,
        status_label=status_label,
        priority_label=priority_label,
        link_url=link,
    )
    enqueue_mail(
        MailPayload(
            event_key=event_key,
            event_type=event_type,
            ticket_id=ticket.id,
            recipient_emp_no=recipient.emp_no,
            recipient_email=recipient.email,
            subject=subject,
            body_text=text,
            body_html=html,
        )
    )


def enqueue_comment_mail(
    *,
    event_key: str,
    event_type: str,
    ticket: Ticket,
    comment: TicketComment,
    recipient: MailTarget,
    subject: str,
    alert_type: str,
    summary: str,
    fields: list[tuple[str, str]],
    status_label: str,
    priority_label: str,
    is_admin_link: bool,
) -> None:
    if not recipient.email:
        return
    link = _ticket_link(ticket.id, is_admin_link)
    text, html = _wrap_template(
        alert_type=alert_type,
        summary=summary,
        fields=fields,
        status_label=status_label,
        priority_label=priority_label,
        link_url=link,
    )
    enqueue_mail(
        MailPayload(
            event_key=event_key,
            event_type=event_type,
            ticket_id=ticket.id,
            recipient_emp_no=recipient.emp_no,
            recipient_email=recipient.email,
            subject=subject,
            body_text=text,
            body_html=html,
        )
    )

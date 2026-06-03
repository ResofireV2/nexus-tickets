![Nexus Tickets](https://raw.githubusercontent.com/ResofireV2/nexus-tickets/main/priv/static/banner.webp)

# Nexus Tickets

Product support ticket system for [Nexus](https://github.com/ResofireV2/nexus) forum software. Members open support tickets, staff reply with internal notes, assign tickets to team members, and track status through a full helpdesk workflow.

---

## Features

**For members**
- Open support tickets with a subject, category, and message
- View and reply to their own tickets
- Receive web and email notifications when staff reply
- Edit their own replies

**For staff**
- Full support queue with status filters — All, Open, In Progress, Awaiting Reply, Resolved, Closed
- Internal notes visible only to staff
- Inline status changes and staff assignment directly from the ticket detail
- Reply editing and deletion (hard delete, with protection on the opening message)
- New ticket notifications delivered to all staff or the assigned member

**For admins**
- Manage support categories — name, slug, color, icon, and drag-to-reorder
- Soft-delete tickets with a dedicated restore queue
- Configure rate limits (max tickets per window) from the admin panel
- Full permission control over who can open tickets, handle tickets, delete tickets, and manage categories — compatible with custom Groups for paid-member gating

---

## Installation

In your Nexus admin panel, go to **Extensions → Install from URL** and paste:

```
https://raw.githubusercontent.com/ResofireV2/nexus-tickets/main/manifest.json
```

Nexus will fetch the latest release, run migrations, and register the extension automatically.

---

## Permissions

| Permission | Default | Description |
|---|---|---|
| Can open a support ticket | Member | Who can submit new tickets. Supports custom Groups for paid-member gating. |
| Can handle support tickets | Moderator | Who can change status, assign, and post internal notes. |
| Can delete support tickets | Admin | Who can soft-delete and restore tickets. |
| Can manage support categories | Admin | Who can create, edit, and reorder categories. |

Permissions are configured under **Admin → Settings → Permissions → Nexus Tickets**.

---

## Settings

| Setting | Default | Description |
|---|---|---|
| Max tickets per window | 10 | Maximum tickets a member can open within the rate limit window. |
| Window (hours) | 24 | Rolling time window in hours for the rate limit. |

---

## Status workflow

Tickets move through five statuses, all changeable by staff from the ticket detail:

```
Open → In Progress → Awaiting Reply → Resolved → Closed
```

Members cannot reply to closed tickets. Staff can reply to tickets in any status.

---

## Notifications

| Type | Trigger | Recipients |
|---|---|---|
| New support ticket | Member opens a ticket | All staff (web) |
| New reply | Staff replies to a ticket | Ticket creator (web + email opt-in) |
| New reply | Member replies to a ticket | Assigned staff, or all staff if unassigned (web + email opt-in) |

Internal notes never trigger notifications. Notification preferences are configurable per user under **Settings → Notifications**.

---

## License

MIT — see [LICENSE](LICENSE).

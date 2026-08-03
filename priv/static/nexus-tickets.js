(function () {
  "use strict";

  const NE   = window.NexusExtensions;
  const SLUG = "nexus-tickets";
  const { useState, useEffect, useCallback, useRef } = window.React;
  const { Av, Md, toast } = window.NexusComponents;

  // ---------------------------------------------------------------------------
  // API helpers
  // ---------------------------------------------------------------------------

  function authHeaders() {
    const token = localStorage.getItem("nexus_token");
    return token
      ? { "authorization": `Bearer ${token}`, "content-type": "application/json" }
      : { "content-type": "application/json" };
  }

  async function api(method, path, body) {
    const res = await fetch(`/ext/${SLUG}/api${path}`, {
      method,
      headers: authHeaders(),
      body: body != null ? JSON.stringify(body) : undefined,
    });
    const data = await res.json();
    if (!res.ok) throw Object.assign(new Error(data.error || "Request failed"), { status: res.status, data });
    return data;
  }

  // ---------------------------------------------------------------------------
  // Status helpers
  // ---------------------------------------------------------------------------

  const STATUS_LABELS = {
    open:          "Open",
    in_progress:   "In Progress",
    awaiting_user: "Awaiting Reply",
    resolved:      "Resolved",
    closed:        "Closed",
  };

  const STATUS_COLORS = {
    open:          { bg: "rgba(16,163,127,0.12)", text: "var(--green)",  border: "rgba(16,163,127,0.25)" },
    in_progress:   { bg: "var(--ac-bg)",              text: "var(--ac-text)", border: "var(--ac-border)"   },
    awaiting_user: { bg: "rgba(251,191,36,0.12)", text: "var(--amber)",  border: "rgba(251,191,36,0.25)" },
    resolved:      { bg: "rgba(100,116,139,0.12)",text: "var(--t4)",     border: "rgba(100,116,139,0.25)"},
    closed:        { bg: "rgba(100,116,139,0.08)",text: "var(--t5)",     border: "rgba(100,116,139,0.18)"},
  };

  function StatusBadge({ status }) {
    const c = STATUS_COLORS[status] || STATUS_COLORS.open;
    return window.React.createElement("span", {
      style: {
        display: "inline-block",
        fontSize: 11, fontWeight: 500,
        padding: "2px 8px", borderRadius: 20,
        background: c.bg, color: c.text,
        border: `0.5px solid ${c.border}`,
      }
    }, STATUS_LABELS[status] || status);
  }

  // ---------------------------------------------------------------------------
  // Shared: category pill
  // ---------------------------------------------------------------------------

  function CategoryPill({ category }) {
    if (!category) return null;
    const color = category.color || "#5B4EF5";
    return window.React.createElement("span", {
      style: {
        display: "inline-flex", alignItems: "center", gap: 5,
        fontSize: 11, fontWeight: 500,
        padding: "2px 8px", borderRadius: 20,
        background: color + "18",
        color: color,
        border: `0.5px solid ${color}40`,
      }
    },
      window.React.createElement("i", { className: `fa-solid ${category.icon || "fa-tag"}`, style: { fontSize: 9 } }),
      category.name
    );
  }

  // ---------------------------------------------------------------------------
  // Shared: format date
  // ---------------------------------------------------------------------------

  function fmt(iso) {
    if (!iso) return "";
    const d = new Date(iso);
    const now = new Date();
    const diff = (now - d) / 1000;
    if (diff < 60)     return "just now";
    if (diff < 3600)   return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400)  return `${Math.floor(diff / 3600)}h ago`;
    if (diff < 604800) return `${Math.floor(diff / 86400)}d ago`;
    return d.toLocaleDateString();
  }

  // ---------------------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------------------

  function EmptyState({ icon, title, subtitle, action }) {
    return window.React.createElement("div", {
      style: {
        padding: "64px 24px", textAlign: "center",
        color: "var(--t4)",
      }
    },
      window.React.createElement("i", {
        className: `fa-solid ${icon}`,
        style: { fontSize: 28, color: "var(--ac)", marginBottom: 14, display: "block", opacity: 0.7 }
      }),
      window.React.createElement("div", { style: { fontSize: 16, fontWeight: 600, color: "var(--t2)", marginBottom: 6 } }, title),
      subtitle && window.React.createElement("div", { style: { fontSize: 13, marginBottom: action ? 20 : 0 } }, subtitle),
      action
    );
  }

  // ---------------------------------------------------------------------------
  // New Ticket page
  // ---------------------------------------------------------------------------

  function NewTicketPage({ currentUser, navigate }) {
    const [categories, setCategories] = useState(null);
    const [form, setForm]             = useState({ subject: "", category_id: "", message: "" });
    const [errors, setErrors]         = useState({});
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
      if (!currentUser) return;
      api("GET", "/categories")
        .then(d => setCategories(d.categories))
        .catch(e => toast(e.message, "err"));
    }, [currentUser]);

    if (!currentUser) {
      return window.React.createElement(EmptyState, {
        icon: "fa-lock",
        title: "Login required",
        subtitle: "You must be logged in to open a support ticket.",
      });
    }

    function set(key, val) {
      setForm(f => ({ ...f, [key]: val }));
      setErrors(e => ({ ...e, [key]: null }));
    }

    async function handleSubmit() {
      const errs = {};
      if (!form.subject.trim())   errs.subject  = "Subject is required";
      if (!form.message.trim())   errs.message  = "Message is required";
      if (Object.keys(errs).length) { setErrors(errs); return; }

      setSubmitting(true);
      try {
        const payload = {
          subject:     form.subject.trim(),
          message:     form.message.trim(),
          category_id: form.category_id || null,
        };
        const data = await api("POST", "/tickets", payload);
        toast("Ticket submitted");
        NE.navigate(`/ext/${SLUG}/${data.ticket.id}`);
      } catch (e) {
        if (e.status === 429) {
          toast("You've opened too many tickets recently. Please wait before trying again.", "err");
        } else if (e.status === 403) {
          toast("You don't have permission to open support tickets.", "err");
        } else {
          toast(e.message, "err");
        }
      } finally {
        setSubmitting(false);
      }
    }

    const fieldStyle = { display: "flex", flexDirection: "column", gap: 5, marginBottom: 18 };
    const labelStyle = { fontSize: 12, fontWeight: 500, color: "var(--t3)" };
    const inputStyle = {
      padding: "9px 12px", fontSize: 13, borderRadius: 9,
      border: "0.5px solid var(--b2)", background: "var(--s1)",
      color: "var(--t1)", outline: "none", width: "100%", boxSizing: "border-box",
    };
    const errStyle = { fontSize: 11, color: "var(--red)", marginTop: 2 };

    return window.React.createElement("div", { style: { maxWidth: 640, margin: "28px auto 0", padding: "0 4px" } },

      // Back link
      window.React.createElement("button", {
        type: "button",
        onClick: () => NE.navigate(`/ext/${SLUG}/`),
        style: {
          background: "none", border: "none", cursor: "pointer",
          color: "var(--t4)", fontSize: 13, padding: 0, marginBottom: 20,
          display: "flex", alignItems: "center", gap: 6,
        }
      },
        window.React.createElement("i", { className: "fa-solid fa-arrow-left", style: { fontSize: 11 } }),
        "Back to tickets"
      ),

      window.React.createElement("div", { style: { fontSize: 18, fontWeight: 700, color: "var(--t1)", marginBottom: 22 } },
        "New Support Ticket"
      ),

      // Subject
      window.React.createElement("div", { style: fieldStyle },
        window.React.createElement("label", { style: labelStyle }, "Subject"),
        window.React.createElement("input", {
          style: { ...inputStyle, borderColor: errors.subject ? "var(--red)" : "var(--b2)" },
          value: form.subject,
          placeholder: "Briefly describe your issue",
          onChange: e => set("subject", e.target.value),
          maxLength: 255,
        }),
        errors.subject && window.React.createElement("span", { style: errStyle }, errors.subject)
      ),

      // Category
      categories && categories.length > 0 && window.React.createElement("div", { style: fieldStyle },
        window.React.createElement("label", { style: labelStyle }, "Category (optional)"),
        window.React.createElement("select", {
          style: { ...inputStyle, cursor: "pointer" },
          value: form.category_id,
          onChange: e => set("category_id", e.target.value),
        },
          window.React.createElement("option", { value: "" }, "Select a category…"),
          categories.map(c =>
            window.React.createElement("option", { key: c.id, value: c.id }, c.name)
          )
        )
      ),

      // Message
      window.React.createElement("div", { style: fieldStyle },
        window.React.createElement("label", { style: labelStyle }, "Message"),
        window.React.createElement("textarea", {
          style: {
            ...inputStyle,
            borderColor: errors.message ? "var(--red)" : "var(--b2)",
            resize: "vertical", minHeight: 140,
          },
          value: form.message,
          placeholder: "Describe your issue in detail…",
          onChange: e => set("message", e.target.value),
        }),
        errors.message && window.React.createElement("span", { style: errStyle }, errors.message)
      ),

      // Submit
      window.React.createElement("div", { style: { display: "flex", gap: 10, justifyContent: "flex-end" } },
        window.React.createElement("button", {
          type: "button", className: "btn-ghost",
          onClick: () => NE.navigate(`/ext/${SLUG}/`),
          disabled: submitting,
        }, "Cancel"),
        window.React.createElement("button", {
          type: "button", className: "btn-primary",
          onClick: handleSubmit,
          disabled: submitting,
        }, submitting ? "Submitting…" : "Submit ticket")
      )
    );
  }

  // ---------------------------------------------------------------------------
  // Ticket index page
  // ---------------------------------------------------------------------------

  const STATUS_FILTERS = [
    { key: "all",          label: "All" },
    { key: "open",         label: "Open" },
    { key: "in_progress",  label: "In Progress" },
    { key: "awaiting_user",label: "Awaiting Reply" },
    { key: "resolved",     label: "Resolved" },
    { key: "closed",       label: "Closed" },
    { key: "deleted",      label: "Deleted", adminOnly: true },
  ];

  function TicketIndexPage({ currentUser, navigate, filter }) {
    const [tickets,  setTickets]  = useState(null);
    const [loading,  setLoading]  = useState(true);
    const activeFilter = filter || "all";
    const isStaff  = currentUser?.role === "moderator" || currentUser?.role === "admin";
    const isAdmin  = currentUser?.role === "admin";
    const isDeleted = activeFilter === "deleted";

    function loadTickets() {
      if (!currentUser) { setLoading(false); return; }
      setLoading(true);

      const path = isDeleted
        ? "/admin/tickets/deleted"
        : isStaff
          ? `/admin/tickets${activeFilter !== "all" ? `?status=${activeFilter}` : ""}`
          : "/tickets";

      api("GET", path)
        .then(d => { setTickets(d.tickets); setLoading(false); })
        .catch(e => { toast(e.message, "err"); setLoading(false); });
    }

    useEffect(() => { loadTickets(); }, [currentUser, activeFilter]);

    async function handleRestore(ticket) {
      try {
        await api("PATCH", `/tickets/${ticket.id}/restore`);
        setTickets(ts => ts.filter(t => t.id !== ticket.id));
        toast("Ticket restored");
      } catch (e) {
        toast(e.message, "err");
      }
    }

    if (!currentUser) {
      return window.React.createElement(EmptyState, {
        icon: "fa-lock",
        title: "Login required",
        subtitle: "Please log in to view support tickets.",
      });
    }

    return window.React.createElement("div", { style: { maxWidth: 780, margin: "28px auto 0" } },

      // Header
      window.React.createElement("div", {
        style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }
      },
        window.React.createElement("div", { style: { fontSize: 18, fontWeight: 700, color: "var(--t1)" } },
          isStaff ? "Support Queue" : "My Tickets"
        ),
        window.React.createElement("button", {
          type: "button", className: "btn-primary",
          style: { fontSize: 12 },
          onClick: () => NE.navigate(`/ext/${SLUG}/new`),
        },
          window.React.createElement("i", { className: "fa-solid fa-plus", style: { marginRight: 6 } }),
          "New ticket"
        )
      ),

      // Status filter tabs — staff only
      isStaff && window.React.createElement("div", {
        style: {
          display: "flex", gap: 4, flexWrap: "wrap",
          marginBottom: 16,
          background: "var(--s2)",
          border: "0.5px solid var(--b1)",
          borderRadius: 10, padding: 4,
          alignSelf: "flex-start",
        }
      },
        STATUS_FILTERS
          .filter(f => !f.adminOnly || isAdmin)
          .map(f =>
          window.React.createElement("button", {
            key: f.key,
            type: "button",
            onClick: () => NE.navigate(
              f.key === "all"
                ? `/ext/${SLUG}/`
                : `/ext/${SLUG}/status/${f.key}`
            ),
            style: {
              fontSize: 12, fontWeight: 500,
              padding: "5px 12px", borderRadius: 7,
              border: "none", cursor: "pointer",
              background: activeFilter === f.key ? "var(--ac)" : "transparent",
              color:      activeFilter === f.key ? "var(--ac-on)" : "var(--t3)",
              transition: "background 0.12s, color 0.12s",
            }
          }, f.label)
        )
      ),

      // Ticket list
      loading
        ? window.React.createElement("div", { style: { padding: "48px 0", textAlign: "center", color: "var(--t5)" } },
            window.React.createElement("i", { className: "fa-solid fa-spinner fa-spin" })
          )
        : tickets && tickets.length === 0
          ? window.React.createElement(EmptyState, {
              icon: isDeleted ? "fa-trash" : "fa-ticket",
              title: isDeleted ? "No deleted tickets" : "No tickets",
              subtitle: isDeleted
                ? "No tickets have been deleted."
                : isStaff
                  ? "No tickets match this filter."
                  : "You haven't opened any support tickets yet.",
              action: !isStaff && !isDeleted && window.React.createElement("button", {
                type: "button", className: "btn-primary",
                style: { fontSize: 13 },
                onClick: () => NE.navigate(`/ext/${SLUG}/new`),
              }, "Open a ticket"),
            })
          : window.React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } },
              (tickets || []).map(ticket =>
                isDeleted
                  ? window.React.createElement(DeletedTicketRow, {
                      key: ticket.id,
                      ticket,
                      onRestore: handleRestore,
                    })
                  : window.React.createElement(TicketRow, {
                      key: ticket.id,
                      ticket,
                      isStaff,
                      onClick: () => NE.navigate(`/ext/${SLUG}/${ticket.id}`),
                    })
              )
            )
    );
  }

  function TicketRow({ ticket, isStaff, onClick }) {
    return window.React.createElement("div", {
      onClick,
      style: {
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 16px",
        background: "var(--s2)",
        border: "0.5px solid var(--b1)",
        borderRadius: 10,
        cursor: "pointer",
        transition: "border-color 0.12s",
      },
      onMouseEnter: e => e.currentTarget.style.borderColor = "var(--ac)",
      onMouseLeave: e => e.currentTarget.style.borderColor = "var(--b1)",
    },
      // Left: icon
      window.React.createElement("div", {
        style: {
          width: 36, height: 36, borderRadius: 9, flexShrink: 0,
          background: "var(--s3)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--t4)", fontSize: 14,
        }
      },
        window.React.createElement("i", { className: "fa-solid fa-ticket" })
      ),

      // Middle: subject + meta
      window.React.createElement("div", { style: { flex: 1, minWidth: 0 } },
        window.React.createElement("div", {
          style: {
            fontSize: 13, fontWeight: 500, color: "var(--t1)",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            marginBottom: 4,
          }
        }, ticket.subject),
        window.React.createElement("div", {
          style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }
        },
          window.React.createElement(CategoryPill, { category: ticket.category }),
          isStaff && ticket.user && window.React.createElement("span", {
            style: { fontSize: 11, color: "var(--t4)" }
          }, ticket.user.username),
          ticket.assigned_staff && window.React.createElement("span", {
            style: {
              fontSize: 11, color: "var(--t4)",
              display: "flex", alignItems: "center", gap: 4,
            }
          },
            window.React.createElement("i", { className: "fa-solid fa-user-tie", style: { fontSize: 9 } }),
            ticket.assigned_staff.username
          )
        )
      ),

      // Right: status + time
      window.React.createElement("div", {
        style: { flexShrink: 0, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 5 }
      },
        window.React.createElement(StatusBadge, { status: ticket.status }),
        window.React.createElement("span", { style: { fontSize: 11, color: "var(--t5)" } },
          fmt(ticket.last_reply_at || ticket.inserted_at)
        )
      )
    );
  }

  // ---------------------------------------------------------------------------
  // Ticket detail page
  // ---------------------------------------------------------------------------

  // ---------------------------------------------------------------------------
  // Ticket detail page
  // ---------------------------------------------------------------------------

  function DeletedTicketRow({ ticket, onRestore }) {
    const [confirming, setConfirming] = useState(false);
    return window.React.createElement("div", {
      style: {
        display: "flex", alignItems: "center", gap: 12,
        padding: "12px 16px",
        background: "var(--s2)",
        border: "0.5px solid var(--b1)",
        borderRadius: 10,
        opacity: 0.7,
      }
    },
      window.React.createElement("div", {
        style: {
          width: 36, height: 36, borderRadius: 9, flexShrink: 0,
          background: "var(--s3)",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "var(--t5)", fontSize: 14,
        }
      },
        window.React.createElement("i", { className: "fa-solid fa-trash" })
      ),
      window.React.createElement("div", { style: { flex: 1, minWidth: 0 } },
        window.React.createElement("div", {
          style: {
            fontSize: 13, fontWeight: 500, color: "var(--t3)",
            whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
            marginBottom: 4, textDecoration: "line-through",
          }
        }, ticket.subject),
        window.React.createElement("div", {
          style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }
        },
          window.React.createElement(CategoryPill, { category: ticket.category }),
          ticket.user && window.React.createElement("span", {
            style: { fontSize: 11, color: "var(--t5)" }
          }, ticket.user.username),
          window.React.createElement("span", { style: { fontSize: 11, color: "var(--t5)" } },
            `deleted ${fmt(ticket.inserted_at)}`
          )
        )
      ),
      confirming
        ? window.React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6, flexShrink: 0 } },
            window.React.createElement("span", { style: { fontSize: 11, color: "var(--t4)" } }, "Restore?"),
            window.React.createElement("button", {
              type: "button",
              onClick: () => onRestore(ticket),
              style: {
                fontSize: 11, padding: "3px 10px", borderRadius: 6, cursor: "pointer",
                background: "var(--green)", color: "#fff", border: "none", fontWeight: 500,
              }
            }, "Yes"),
            window.React.createElement("button", {
              type: "button",
              onClick: () => setConfirming(false),
              style: {
                fontSize: 11, padding: "3px 10px", borderRadius: 6, cursor: "pointer",
                background: "var(--s3)", color: "var(--t3)", border: "none",
              }
            }, "No")
          )
        : window.React.createElement("button", {
            type: "button", className: "btn-ghost",
            style: { fontSize: 12, flexShrink: 0 },
            onClick: e => { e.stopPropagation(); setConfirming(true); },
          }, "Restore")
    );
  }

  function TicketDetailPage({ currentUser, navigate, id }) {
    const [ticket,      setTicket]      = useState(null);
    const [loading,     setLoading]     = useState(true);
    const [notFound,    setNotFound]    = useState(false);
    const [replyText,   setReplyText]   = useState("");
    const [isNote,      setIsNote]      = useState(false);
    const [submitting,  setSubmitting]  = useState(false);
    const [editingId,   setEditingId]   = useState(null);  // reply id being edited
    const [editText,    setEditText]    = useState("");
    const [editSaving,  setEditSaving]  = useState(false);
    const [staffList,   setStaffList]   = useState([]);
    const [updating,    setUpdating]    = useState(false);
    const [deleting,    setDeleting]    = useState(false);
    const isStaff = currentUser?.role === "moderator" || currentUser?.role === "admin";
    const isAdmin = currentUser?.role === "admin";

    function loadTicket() {
      if (!currentUser || !id) { setLoading(false); return; }
      api("GET", `/tickets/${id}`)
        .then(d => { setTicket(d.ticket); setLoading(false); })
        .catch(e => {
          if (e.status === 404 || e.status === 403) setNotFound(true);
          else toast(e.message, "err");
          setLoading(false);
        });
    }

    useEffect(() => { loadTicket(); }, [id, currentUser]);

    useEffect(() => {
      if (!isStaff) return;
      api("GET", "/admin/staff")
        .then(d => setStaffList(d.staff || []))
        .catch(() => {});
    }, [isStaff]);

    async function updateTicket(attrs) {
      setUpdating(true);
      try {
        const data = await api("PATCH", `/tickets/${id}`, attrs);
        setTicket(t => ({ ...t, ...data.ticket }));
      } catch (e) {
        toast(e.message, "err");
      } finally {
        setUpdating(false);
      }
    }

    async function deleteTicket() {
      setDeleting(true);
      try {
        await api("DELETE", `/tickets/${id}`);
        toast("Ticket deleted");
        NE.navigate(`/ext/${SLUG}/`);
      } catch (e) {
        toast(e.message, "err");
        setDeleting(false);
      }
    }

    async function handleReply() {
      if (!replyText.trim()) return;
      setSubmitting(true);
      try {
        const data = await api("POST", `/tickets/${id}/replies`, {
          content:          replyText.trim(),
          is_internal_note: isNote,
        });
        setTicket(t => ({ ...t, replies: [...(t.replies || []), data.reply] }));
        setReplyText("");
        setIsNote(false);
      } catch (e) {
        toast(e.message, "err");
      } finally {
        setSubmitting(false);
      }
    }

    function startEdit(reply) {
      setEditingId(reply.id);
      setEditText(reply.content);
    }

    function cancelEdit() {
      setEditingId(null);
      setEditText("");
    }

    async function saveEdit(replyId) {
      if (!editText.trim()) return;
      setEditSaving(true);
      try {
        const data = await api("PATCH", `/replies/${replyId}`, { content: editText.trim() });
        setTicket(t => ({
          ...t,
          replies: t.replies.map(r => r.id === replyId ? data.reply : r),
        }));
        setEditingId(null);
        setEditText("");
      } catch (e) {
        toast(e.message, "err");
      } finally {
        setEditSaving(false);
      }
    }

    async function deleteReply(replyId) {
      try {
        await api("DELETE", `/replies/${replyId}`);
        setTicket(t => ({ ...t, replies: t.replies.filter(r => r.id !== replyId) }));
        toast("Reply deleted");
      } catch (e) {
        toast(e.message, "err");
      }
    }

    if (!currentUser) {
      return window.React.createElement(EmptyState, { icon: "fa-lock", title: "Login required" });
    }

    if (loading) {
      return window.React.createElement("div", {
        style: { padding: "64px 0", textAlign: "center", color: "var(--t5)" }
      }, window.React.createElement("i", { className: "fa-solid fa-spinner fa-spin" }));
    }

    if (notFound || !ticket) {
      return window.React.createElement(EmptyState, {
        icon: "fa-circle-exclamation",
        title: "Ticket not found",
        subtitle: "This ticket doesn't exist or you don't have access to it.",
        action: window.React.createElement("button", {
          type: "button", className: "btn-ghost", style: { fontSize: 13 },
          onClick: () => NE.navigate(`/ext/${SLUG}/`),
        }, "Back to tickets"),
      });
    }

    const canReply = ticket.status !== "closed" || isStaff;
    const isOwner  = ticket.user?.id === currentUser?.id;

    return window.React.createElement("div", { style: { maxWidth: 720, margin: "28px auto 0", paddingBottom: 48 } },

      // Back
      window.React.createElement("button", {
        type: "button",
        onClick: () => NE.navigate(`/ext/${SLUG}/`),
        style: {
          background: "none", border: "none", cursor: "pointer",
          color: "var(--t4)", fontSize: 13, padding: 0, marginBottom: 18,
          display: "flex", alignItems: "center", gap: 6,
        }
      },
        window.React.createElement("i", { className: "fa-solid fa-arrow-left", style: { fontSize: 11 } }),
        "Back to tickets"
      ),

      // Ticket header
      window.React.createElement("div", {
        style: {
          background: "var(--s2)", border: "0.5px solid var(--b1)",
          borderRadius: 12, padding: "18px 20px", marginBottom: 16,
        }
      },
        // Subject + meta row
        window.React.createElement("div", { style: { flex: 1, minWidth: 0, marginBottom: isStaff ? 14 : 0 } },
          window.React.createElement("div", {
            style: { fontSize: 17, fontWeight: 700, color: "var(--t1)", marginBottom: 8, lineHeight: 1.3 }
          }, ticket.subject),
          window.React.createElement("div", {
            style: { display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }
          },
            // Members see read-only status badge; staff see it too for quick reference
            window.React.createElement(StatusBadge, { status: ticket.status }),
            window.React.createElement(CategoryPill, { category: ticket.category }),
            window.React.createElement("span", { style: { fontSize: 11, color: "var(--t5)" } },
              `#${ticket.id} · opened ${fmt(ticket.inserted_at)}`
            ),
            ticket.user && window.React.createElement("span", { style: { fontSize: 11, color: "var(--t4)" } },
              `by ${ticket.user.username}`
            )
          )
        ),

        // Staff controls — status + assignment
        isStaff && window.React.createElement("div", {
          style: {
            display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap",
            paddingTop: 14, borderTop: "0.5px solid var(--b1)",
          }
        },
          // Status selector
          window.React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } },
            window.React.createElement("span", { style: { fontSize: 11, color: "var(--t4)", flexShrink: 0 } }, "Status"),
            window.React.createElement("select", {
              disabled: updating,
              value: ticket.status,
              onChange: e => updateTicket({ status: e.target.value }),
              style: {
                fontSize: 12, padding: "4px 8px", borderRadius: 7,
                border: "0.5px solid var(--b2)", background: "var(--s1)",
                color: "var(--t1)", cursor: "pointer", outline: "none",
              }
            },
              window.React.createElement("option", { value: "open" },          "Open"),
              window.React.createElement("option", { value: "in_progress" },   "In Progress"),
              window.React.createElement("option", { value: "awaiting_user" }, "Awaiting Reply"),
              window.React.createElement("option", { value: "resolved" },      "Resolved"),
              window.React.createElement("option", { value: "closed" },        "Closed")
            )
          ),

          // Divider
          window.React.createElement("div", {
            style: { width: "0.5px", height: 16, background: "var(--b2)", alignSelf: "center" }
          }),

          // Assignment selector
          window.React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } },
            window.React.createElement("span", { style: { fontSize: 11, color: "var(--t4)", flexShrink: 0 } }, "Assigned to"),
            window.React.createElement("select", {
              disabled: updating,
              value: ticket.assigned_staff?.id ?? "",
              onChange: e => updateTicket({ assigned_staff_id: e.target.value || null }),
              style: {
                fontSize: 12, padding: "4px 8px", borderRadius: 7,
                border: "0.5px solid var(--b2)", background: "var(--s1)",
                color: "var(--t1)", cursor: "pointer", outline: "none",
              }
            },
              window.React.createElement("option", { value: "" }, "Unassigned"),
              staffList.map(s =>
                window.React.createElement("option", { key: s.id, value: s.id }, s.username)
              )
            )
          ),

          // Saving indicator
          updating && window.React.createElement("span", {
            style: { fontSize: 11, color: "var(--t5)" }
          },
            window.React.createElement("i", { className: "fa-solid fa-spinner fa-spin", style: { marginRight: 4 } }),
            "Saving…"
          ),

          // Delete button — pushed to the right, admin only
          isAdmin && window.React.createElement("div", { style: { marginLeft: "auto" } },
            deleting === "confirm"
              ? window.React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 6 } },
                  window.React.createElement("span", { style: { fontSize: 11, color: "var(--t4)" } }, "Delete ticket?"),
                  window.React.createElement("button", {
                    type: "button",
                    onClick: deleteTicket,
                    style: {
                      fontSize: 11, padding: "3px 10px", borderRadius: 6, cursor: "pointer",
                      background: "var(--red)", color: "#fff", border: "none", fontWeight: 500,
                    }
                  }, "Yes"),
                  window.React.createElement("button", {
                    type: "button",
                    onClick: () => setDeleting(false),
                    style: {
                      fontSize: 11, padding: "3px 10px", borderRadius: 6, cursor: "pointer",
                      background: "var(--s3)", color: "var(--t3)", border: "none",
                    }
                  }, "No")
                )
              : window.React.createElement("button", {
                  type: "button", className: "btn-ghost",
                  style: { fontSize: 11, color: "var(--t4)", borderColor: "var(--b2)" },
                  onClick: () => setDeleting("confirm"),
                  disabled: updating,
                },
                  window.React.createElement("i", { className: "fa-solid fa-trash", style: { marginRight: 5, fontSize: 10 } }),
                  "Delete"
                )
          )
        ),

        // Member view — assigned staff (read-only)
        !isStaff && ticket.assigned_staff && window.React.createElement("div", {
          style: {
            display: "flex", alignItems: "center", gap: 8, marginTop: 10,
            paddingTop: 10, borderTop: "0.5px solid var(--b1)",
            fontSize: 12, color: "var(--t4)",
          }
        },
          window.React.createElement("i", { className: "fa-solid fa-user-tie", style: { fontSize: 11 } }),
          "Assigned to",
          window.React.createElement(Av, { user: ticket.assigned_staff, size: 18 }),
          window.React.createElement("span", { style: { color: "var(--t2)", fontWeight: 500 } },
            ticket.assigned_staff.username
          )
        )
      ),

      // Reply thread
      window.React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 } },
        (ticket.replies || []).map((reply, idx) =>
          window.React.createElement(ReplyBubble, {
            key: reply.id,
            reply,
            isStaff,
            currentUser,
            isFirst: idx === 0,
            isEditing: editingId === reply.id,
            editText,
            editSaving,
            onEditText:   setEditText,
            onStartEdit:  startEdit,
            onCancelEdit: cancelEdit,
            onSaveEdit:   saveEdit,
            onDelete:     deleteReply,
          })
        )
      ),

      // Reply composer
      canReply && window.React.createElement("div", {
        style: {
          background: "var(--s2)", border: "0.5px solid var(--b1)",
          borderRadius: 12, padding: "16px",
        }
      },
        // Internal note toggle — staff only
        isStaff && window.React.createElement("div", {
          style: {
            display: "flex", alignItems: "center", gap: 10,
            marginBottom: 10, padding: "8px 12px",
            background: isNote ? "rgba(251,191,36,0.06)" : "var(--s1)",
            border: `0.5px solid ${isNote ? "rgba(251,191,36,0.25)" : "var(--b2)"}`,
            borderRadius: 8, cursor: "pointer",
          },
          onClick: () => setIsNote(n => !n),
        },
          window.React.createElement("div", {
            style: {
              width: 18, height: 18, borderRadius: 4, border: "1.5px solid",
              borderColor: isNote ? "var(--amber)" : "var(--b2)",
              background:  isNote ? "var(--amber)"  : "transparent",
              display: "flex", alignItems: "center", justifyContent: "center",
              flexShrink: 0, transition: "all 0.12s",
            }
          },
            isNote && window.React.createElement("i", {
              className: "fa-solid fa-check",
              style: { fontSize: 9, color: "#000" }
            })
          ),
          window.React.createElement("div", null,
            window.React.createElement("div", { style: { fontSize: 12, fontWeight: 500, color: isNote ? "var(--amber)" : "var(--t3)" } },
              "Internal note"
            ),
            window.React.createElement("div", { style: { fontSize: 11, color: "var(--t5)" } },
              "Only visible to staff"
            )
          )
        ),

        // Textarea
        window.React.createElement("textarea", {
          style: {
            width: "100%", boxSizing: "border-box",
            padding: "10px 12px", fontSize: 13,
            borderRadius: 8, border: "0.5px solid var(--b2)",
            background: "var(--s1)", color: "var(--t1)",
            outline: "none", resize: "vertical", minHeight: 96,
          },
          placeholder: isNote ? "Write an internal note…" : "Write a reply…",
          value: replyText,
          onChange: e => setReplyText(e.target.value),
          onKeyDown: e => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleReply();
          },
        }),

        // Submit row
        window.React.createElement("div", {
          style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 10 }
        },
          window.React.createElement("span", { style: { fontSize: 11, color: "var(--t5)" } },
            "Cmd/Ctrl + Enter to send"
          ),
          window.React.createElement("button", {
            type: "button", className: "btn-primary",
            disabled: submitting || !replyText.trim(),
            onClick: handleReply,
            style: { fontSize: 13 },
          }, submitting ? "Sending…" : (isNote ? "Post note" : "Send reply"))
        )
      ),

      // Closed notice for members
      !canReply && window.React.createElement("div", {
        style: {
          padding: "14px 16px", borderRadius: 10,
          background: "var(--s2)", border: "0.5px solid var(--b1)",
          fontSize: 13, color: "var(--t4)", textAlign: "center",
        }
      },
        window.React.createElement("i", { className: "fa-solid fa-lock", style: { marginRight: 8 } }),
        "This ticket is closed."
      )
    );
  }

  function ReplyBubble({
    reply, isStaff, currentUser, isFirst,
    isEditing, editText, editSaving,
    onEditText, onStartEdit, onCancelEdit, onSaveEdit, onDelete,
  }) {
    const [confirmDelete, setConfirmDelete] = useState(false);
    const isNote   = reply.is_internal_note;
    const isOwn    = reply.user?.id === currentUser?.id;
    const canEdit  = isOwn || isStaff;
    const canDelete= isStaff && !isFirst;

    return window.React.createElement("div", {
      style: {
        background: isNote ? "rgba(251,191,36,0.06)" : "var(--s2)",
        border: `0.5px solid ${isNote ? "rgba(251,191,36,0.25)" : "var(--b1)"}`,
        borderRadius: 12, padding: "14px 16px",
      }
    },
      // Header
      window.React.createElement("div", {
        style: { display: "flex", alignItems: "center", gap: 8, marginBottom: isEditing ? 10 : 8 }
      },
        reply.user && window.React.createElement(Av, { user: reply.user, size: 26 }),
        window.React.createElement("div", { style: { flex: 1, minWidth: 0 } },
          window.React.createElement("div", {
            style: { display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap" }
          },
            window.React.createElement("span", { style: { fontSize: 13, fontWeight: 600, color: "var(--t1)" } },
              reply.user?.username || "Deleted user"
            ),
            reply.user?.role && reply.user.role !== "member" && window.React.createElement("span", {
              style: {
                fontSize: 10, fontWeight: 500, padding: "1px 6px", borderRadius: 20,
                background: "var(--ac-bg)", color: "var(--ac-text)",
                border: "0.5px solid var(--ac-border)",
              }
            }, reply.user.role),
            isNote && window.React.createElement("span", {
              style: {
                fontSize: 10, fontWeight: 500, padding: "1px 6px", borderRadius: 20,
                background: "rgba(251,191,36,0.12)", color: "var(--amber)",
                border: "0.5px solid rgba(251,191,36,0.3)",
              }
            },
              window.React.createElement("i", { className: "fa-solid fa-lock", style: { marginRight: 3, fontSize: 8 } }),
              "Internal note"
            ),
            window.React.createElement("span", { style: { fontSize: 11, color: "var(--t5)" } },
              fmt(reply.inserted_at)
            ),
            reply.edited_at && window.React.createElement("span", { style: { fontSize: 10, color: "var(--t5)" } },
              "(edited)"
            )
          )
        ),

        // Action buttons — shown when not editing and user has permission
        !isEditing && (canEdit || canDelete) && window.React.createElement("div", {
          style: { display: "flex", gap: 4, flexShrink: 0 }
        },
          canEdit && !confirmDelete && window.React.createElement("button", {
            type: "button",
            onClick: () => onStartEdit(reply),
            style: {
              background: "none", border: "none", cursor: "pointer",
              color: "var(--t5)", fontSize: 12, padding: "2px 6px",
              borderRadius: 5,
            },
            title: "Edit",
          }, window.React.createElement("i", { className: "fa-solid fa-pen" })),

          canDelete && !confirmDelete && window.React.createElement("button", {
            type: "button",
            onClick: () => setConfirmDelete(true),
            style: {
              background: "none", border: "none", cursor: "pointer",
              color: "var(--t5)", fontSize: 12, padding: "2px 6px",
              borderRadius: 5,
            },
            title: "Delete",
          }, window.React.createElement("i", { className: "fa-solid fa-trash" })),

          // Delete confirmation
          confirmDelete && window.React.createElement("div", {
            style: { display: "flex", alignItems: "center", gap: 6 }
          },
            window.React.createElement("span", { style: { fontSize: 11, color: "var(--t4)" } }, "Delete?"),
            window.React.createElement("button", {
              type: "button",
              onClick: () => { onDelete(reply.id); setConfirmDelete(false); },
              style: {
                fontSize: 11, padding: "2px 8px", borderRadius: 5, cursor: "pointer",
                background: "var(--red)", color: "#fff", border: "none",
              },
            }, "Yes"),
            window.React.createElement("button", {
              type: "button",
              onClick: () => setConfirmDelete(false),
              style: {
                fontSize: 11, padding: "2px 8px", borderRadius: 5, cursor: "pointer",
                background: "var(--s3)", color: "var(--t3)", border: "none",
              },
            }, "No")
          )
        )
      ),

      // Body — edit mode or read mode
      isEditing
        ? window.React.createElement("div", null,
            window.React.createElement("textarea", {
              style: {
                width: "100%", boxSizing: "border-box",
                padding: "9px 12px", fontSize: 13,
                borderRadius: 8, border: "0.5px solid var(--ac)",
                background: "var(--s1)", color: "var(--t1)",
                outline: "none", resize: "vertical", minHeight: 80,
              },
              value: editText,
              autoFocus: true,
              onChange: e => onEditText(e.target.value),
            }),
            window.React.createElement("div", {
              style: { display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 8 }
            },
              window.React.createElement("button", {
                type: "button", className: "btn-ghost",
                style: { fontSize: 12 },
                onClick: onCancelEdit,
                disabled: editSaving,
              }, "Cancel"),
              window.React.createElement("button", {
                type: "button", className: "btn-primary",
                style: { fontSize: 12 },
                onClick: () => onSaveEdit(reply.id),
                disabled: editSaving || !editText.trim(),
              }, editSaving ? "Saving…" : "Save")
            )
          )
        : window.React.createElement(Md, { text: reply.content })
    );
  }

  function FilteredIndexPage({ currentUser, navigate, filter }) {
    return window.React.createElement(TicketIndexPage, { currentUser, navigate, filter });
  }

  // ---------------------------------------------------------------------------
  // Right widget
  // ---------------------------------------------------------------------------

  function SupportWidget({ currentUser }) {
    const [data, setData] = useState(null);
    const isStaff = currentUser?.role === "moderator" || currentUser?.role === "admin";

    useEffect(() => {
      if (!currentUser) return;
      const path = isStaff ? "/admin/tickets?status=open" : "/tickets";
      api("GET", path)
        .then(d => setData(d.tickets))
        .catch(() => {});
    }, [currentUser]);

    if (!currentUser) return null;

    const openCount = isStaff
      ? (data?.filter(t => t.status === "open").length ?? null)
      : (data?.filter(t => ["open","in_progress","awaiting_user"].includes(t.status)).length ?? null);

    return window.React.createElement("div", {
      style: {
        padding: "12px 14px",
        background: "var(--s2)",
        border: "0.5px solid var(--b1)",
        borderRadius: 12,
      }
    },
      window.React.createElement("div", {
        style: {
          display: "flex", alignItems: "center", justifyContent: "space-between",
          marginBottom: openCount != null ? 8 : 0,
        }
      },
        window.React.createElement("div", { style: { fontSize: 12, fontWeight: 600, color: "var(--t3)" } },
          "Support"
        ),
        window.React.createElement("button", {
          type: "button",
          onClick: () => NE.navigate(`/ext/${SLUG}/`),
          style: {
            background: "none", border: "none", cursor: "pointer",
            fontSize: 11, color: "var(--ac)", padding: 0,
          }
        }, "View all")
      ),

      openCount != null && window.React.createElement("div", { style: { fontSize: 12, color: "var(--t4)" } },
        isStaff
          ? `${openCount} open ticket${openCount === 1 ? "" : "s"}`
          : `${openCount} active ticket${openCount === 1 ? "" : "s"}`
      )
    );
  }

  // ---------------------------------------------------------------------------
  // Notification type registrations
  // ---------------------------------------------------------------------------

  NE.registerNotificationType("new_reply", {
    icon:      "fa-reply",
    iconColor: "var(--ac)",
    renderBody(n) {
      const subject = n.data?.ticket_subject || "your ticket";
      return window.React.createElement("span", null, `New reply on: ${subject}`);
    },
    onClick({ n }) {
      const ticketId = n.data?.ticket_id;
      if (ticketId) NE.navigate(`/ext/${SLUG}/${ticketId}`);
    },
  });

  NE.registerNotificationType("new_ticket", {
    icon:      "fa-ticket",
    iconColor: "var(--green)",
    renderBody(n) {
      const subject = n.data?.ticket_subject || "a ticket";
      return window.React.createElement("span", null, `New support ticket: ${subject}`);
    },
    onClick({ n }) {
      const ticketId = n.data?.ticket_id;
      if (ticketId) NE.navigate(`/ext/${SLUG}/${ticketId}`);
    },
  });

  // ---------------------------------------------------------------------------
  // Admin panel (unchanged from Stage 1)
  // ---------------------------------------------------------------------------

  const PRESET_COLORS = [
    "#5B4EF5","#7C3AED","#DB2777","#DC2626",
    "#EA580C","#D97706","#16A34A","#0891B2",
    "#0284C7","#4F46E5","#64748B","#374151",
  ];

  function ColorPicker({ value, onChange }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);
    useEffect(() => {
      if (!open) return;
      function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    return window.React.createElement("div", { style: { position: "relative", display: "inline-block" }, ref },
      window.React.createElement("button", {
        type: "button", onClick: () => setOpen(o => !o),
        style: { width:28, height:28, borderRadius:6, background:value||"#5B4EF5", border:"0.5px solid var(--b2)", cursor:"pointer", flexShrink:0 }
      }),
      open && window.React.createElement("div", {
        style: { position:"absolute", top:34, left:0, zIndex:200, background:"var(--s2)", border:"0.5px solid var(--b1)", borderRadius:10, padding:10, display:"grid", gridTemplateColumns:"repeat(6, 1fr)", gap:6, boxShadow:"0 4px 16px rgba(0,0,0,0.18)" }
      },
        PRESET_COLORS.map(c => window.React.createElement("button", {
          key:c, type:"button", onClick:()=>{onChange(c);setOpen(false);},
          style:{width:24,height:24,borderRadius:5,background:c,border:value===c?"2px solid var(--t1)":"0.5px solid var(--b2)",cursor:"pointer"}
        })),
        window.React.createElement("input", {
          type:"text", defaultValue:value, placeholder:"#rrggbb",
          onBlur:e=>{const v=e.target.value.trim();if(/^#[0-9a-fA-F]{6}$/.test(v)){onChange(v);setOpen(false);}},
          style:{gridColumn:"span 6",marginTop:4,padding:"4px 8px",fontSize:12,borderRadius:6,border:"0.5px solid var(--b2)",background:"var(--s1)",color:"var(--t1)",width:"100%",boxSizing:"border-box"}
        })
      )
    );
  }

  function CategoryForm({ initial, onSave, onCancel }) {
    const blank = { name:"", slug:"", description:"", color:"#5B4EF5", icon:"fa-tag" };
    const [form, setForm] = useState(initial || blank);
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState({});
    const nameRef = useRef(initial ? null : true);

    function set(key, val) { setForm(f=>({...f,[key]:val})); setErrors(e=>({...e,[key]:null})); }
    function handleNameChange(val) {
      set("name", val);
      if (!initial && nameRef.current) {
        set("slug", val.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,""));
      }
    }

    async function handleSubmit() {
      setSaving(true); setErrors({});
      try {
        const result = initial
          ? await api("PATCH", `/admin/categories/${initial.id}`, form)
          : await api("POST",  "/admin/categories", form);
        onSave(result.category);
      } catch(e) {
        try { setErrors(JSON.parse(e.message).errors||{}); } catch(_) { toast(e.message,"err"); }
      } finally { setSaving(false); }
    }

    const fs={display:"flex",flexDirection:"column",gap:4,marginBottom:16};
    const ls={fontSize:12,fontWeight:500,color:"var(--t3)"};
    const is={padding:"8px 10px",fontSize:13,borderRadius:8,border:"0.5px solid var(--b2)",background:"var(--s1)",color:"var(--t1)",outline:"none",width:"100%",boxSizing:"border-box"};
    const es={fontSize:11,color:"var(--red)",marginTop:2};

    return window.React.createElement("div", {style:{padding:"4px 0"}},
      window.React.createElement("div",{style:fs},window.React.createElement("label",{style:ls},"Name"),
        window.React.createElement("input",{style:{...is,borderColor:errors.name?"var(--red)":"var(--b2)"},value:form.name,placeholder:"e.g. Billing",onChange:e=>handleNameChange(e.target.value)}),
        errors.name&&window.React.createElement("span",{style:es},errors.name)),
      window.React.createElement("div",{style:fs},window.React.createElement("label",{style:ls},"Slug"),
        window.React.createElement("input",{style:{...is,borderColor:errors.slug?"var(--red)":"var(--b2)"},value:form.slug,placeholder:"e.g. billing",onChange:e=>{nameRef.current=false;set("slug",e.target.value);}}),
        errors.slug&&window.React.createElement("span",{style:es},errors.slug)),
      window.React.createElement("div",{style:fs},window.React.createElement("label",{style:ls},"Description (optional)"),
        window.React.createElement("textarea",{style:{...is,resize:"vertical",minHeight:64},value:form.description||"",placeholder:"What kinds of tickets belong in this category?",onChange:e=>set("description",e.target.value)})),
      window.React.createElement("div",{style:{display:"flex",gap:16,marginBottom:16}},
        window.React.createElement("div",{style:{...fs,marginBottom:0,flex:1}},window.React.createElement("label",{style:ls},"Color"),
          window.React.createElement("div",{style:{display:"flex",alignItems:"center",gap:8}},
            window.React.createElement(ColorPicker,{value:form.color,onChange:v=>set("color",v)}),
            window.React.createElement("span",{style:{fontSize:12,color:"var(--t4)"}},form.color))),
        window.React.createElement("div",{style:{...fs,marginBottom:0,flex:1}},window.React.createElement("label",{style:ls},"Icon (Font Awesome)"),
          window.React.createElement("input",{style:is,value:form.icon||"",placeholder:"fa-tag",onChange:e=>set("icon",e.target.value)}))),
      form.icon&&window.React.createElement("div",{style:{display:"flex",alignItems:"center",gap:8,marginBottom:20,fontSize:13,color:"var(--t4)"}},
        window.React.createElement("span",null,"Preview: "),
        window.React.createElement("span",{style:{display:"inline-flex",alignItems:"center",gap:6,padding:"3px 10px",borderRadius:20,background:(form.color||"#5B4EF5")+"18",border:`0.5px solid ${form.color||"#5B4EF5"}40`,color:form.color||"#5B4EF5",fontSize:12}},
          window.React.createElement("i",{className:`fa-solid ${form.icon}`}),form.name||"Category")),
      window.React.createElement("div",{style:{display:"flex",gap:8,justifyContent:"flex-end"}},
        window.React.createElement("button",{type:"button",className:"btn-ghost",onClick:onCancel,disabled:saving},"Cancel"),
        window.React.createElement("button",{type:"button",className:"btn-primary",onClick:handleSubmit,disabled:saving},saving?"Saving…":(initial?"Save changes":"Create category")))
    );
  }

  function CategoryRow({ category, onEdit, onDelete, dragHandleProps }) {
    const [confirming, setConfirming] = useState(false);
    return window.React.createElement("div",{style:{display:"flex",alignItems:"center",gap:10,padding:"10px 14px",background:"var(--s2)",borderRadius:10,border:"0.5px solid var(--b1)"}},
      window.React.createElement("span",{...dragHandleProps,style:{cursor:"grab",color:"var(--t5)",fontSize:13,flexShrink:0,userSelect:"none"},title:"Drag to reorder"},window.React.createElement("i",{className:"fa-solid fa-grip-vertical"})),
      window.React.createElement("span",{style:{width:28,height:28,borderRadius:7,flexShrink:0,background:(category.color||"#5B4EF5")+"18",display:"flex",alignItems:"center",justifyContent:"center",color:category.color||"#5B4EF5",fontSize:13}},window.React.createElement("i",{className:`fa-solid ${category.icon||"fa-tag"}`})),
      window.React.createElement("div",{style:{flex:1,minWidth:0}},
        window.React.createElement("div",{style:{fontSize:13,fontWeight:500,color:"var(--t1)"}},category.name),
        window.React.createElement("div",{style:{fontSize:11,color:"var(--t5)",marginTop:1}},category.slug,(category.description&&` · ${category.description}`))),
      confirming
        ?window.React.createElement("div",{style:{display:"flex",gap:6,alignItems:"center"}},
            window.React.createElement("span",{style:{fontSize:12,color:"var(--t3)"}},"Delete?"),
            window.React.createElement("button",{type:"button",className:"btn-ghost",style:{fontSize:12,padding:"3px 10px",color:"var(--red)",borderColor:"var(--red)"},onClick:()=>onDelete(category)},"Yes"),
            window.React.createElement("button",{type:"button",className:"btn-ghost",style:{fontSize:12,padding:"3px 10px"},onClick:()=>setConfirming(false)},"No"))
        :window.React.createElement("div",{style:{display:"flex",gap:6}},
            window.React.createElement("button",{type:"button",className:"btn-ghost",style:{fontSize:12,padding:"3px 10px"},onClick:()=>onEdit(category)},"Edit"),
            window.React.createElement("button",{type:"button",className:"btn-ghost",style:{fontSize:12,padding:"3px 10px",color:"var(--red)",borderColor:"var(--red)"},onClick:()=>setConfirming(true)},"Delete"))
    );
  }

  function CategoriesTab() {
    const [categories,setCategories]=useState(null);
    const [creating,setCreating]=useState(false);
    const [editing,setEditing]=useState(null);
    const [dragIdx,setDragIdx]=useState(null);
    const [overIdx,setOverIdx]=useState(null);

    useEffect(()=>{
      api("GET","/admin/categories").then(d=>setCategories(d.categories)).catch(e=>toast(e.message,"err"));
    },[]);

    async function handleDrop(){
      if(dragIdx==null||overIdx==null||dragIdx===overIdx){setDragIdx(null);setOverIdx(null);return;}
      const r=[...categories];const[m]=r.splice(dragIdx,1);r.splice(overIdx,0,m);
      setCategories(r);setDragIdx(null);setOverIdx(null);
      try{await api("POST","/admin/categories/reorder",{ids:r.map(c=>c.id)});}
      catch(e){toast("Failed to save order: "+e.message,"err");}
    }

    function handleCreated(c){setCategories(cs=>[...(cs||[]),c]);setCreating(false);toast("Category created");}
    function handleUpdated(c){setCategories(cs=>cs.map(x=>x.id===c.id?c:x));setEditing(null);toast("Category updated");}
    async function handleDelete(c){
      try{await api("DELETE",`/admin/categories/${c.id}`);setCategories(cs=>cs.filter(x=>x.id!==c.id));toast("Category deleted");}
      catch(e){toast(e.message,"err");}
    }

    if(categories===null)return window.React.createElement("div",{style:{padding:"48px 0",textAlign:"center",color:"var(--t5)"}},window.React.createElement("i",{className:"fa-solid fa-spinner fa-spin"}));

    return window.React.createElement("div",{style:{paddingTop:8}},
      window.React.createElement("div",{style:{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}},
        window.React.createElement("div",null,
          window.React.createElement("div",{style:{fontSize:14,fontWeight:600,color:"var(--t1)"}},"Categories"),
          window.React.createElement("div",{style:{fontSize:12,color:"var(--t4)",marginTop:2}},categories.length===0?"No categories yet. Create one to get started.":`${categories.length} categor${categories.length===1?"y":"ies"} · drag to reorder`)),
        !creating&&!editing&&window.React.createElement("button",{type:"button",className:"btn-primary",style:{fontSize:12},onClick:()=>setCreating(true)},window.React.createElement("i",{className:"fa-solid fa-plus",style:{marginRight:6}}),"New category")),
      creating&&window.React.createElement("div",{style:{background:"var(--s2)",border:"0.5px solid var(--b1)",borderRadius:12,padding:16,marginBottom:16}},
        window.React.createElement("div",{style:{fontSize:13,fontWeight:600,color:"var(--t1)",marginBottom:14}},"New category"),
        window.React.createElement(CategoryForm,{onSave:handleCreated,onCancel:()=>setCreating(false)})),
      window.React.createElement("div",{style:{display:"flex",flexDirection:"column",gap:6}},
        categories.length===0&&!creating&&window.React.createElement("div",{style:{padding:"32px 16px",textAlign:"center",background:"var(--s2)",border:"0.5px solid var(--b1)",borderRadius:12,color:"var(--t5)",fontSize:13}},"No categories yet. Use the button above to create your first one."),
        categories.map((cat,idx)=>
          editing&&editing.id===cat.id
            ?window.React.createElement("div",{key:cat.id,style:{background:"var(--s2)",border:"0.5px solid var(--ac)",borderRadius:12,padding:16}},
                window.React.createElement("div",{style:{fontSize:13,fontWeight:600,color:"var(--t1)",marginBottom:14}},"Edit category"),
                window.React.createElement(CategoryForm,{initial:editing,onSave:handleUpdated,onCancel:()=>setEditing(null)}))
            :window.React.createElement("div",{key:cat.id,draggable:!creating&&!editing,
                onDragStart:()=>setDragIdx(idx),onDragOver:e=>{e.preventDefault();setOverIdx(idx);},onDrop:handleDrop,
                style:{opacity:dragIdx===idx?0.4:1,outline:overIdx===idx&&dragIdx!==idx?"1.5px dashed var(--ac)":"none",borderRadius:10,transition:"opacity 0.15s"}},
              window.React.createElement(CategoryRow,{category:cat,onEdit:()=>setEditing(cat),onDelete:handleDelete,dragHandleProps:{draggable:false}}))
        )
      )
    );
  }

  function AdminPanel() {
    const { TabbedPanel, SimpleSettingsPanel } = window.NexusExtensionTemplates;
    return window.React.createElement(TabbedPanel, {
      tabs: [
        { key:"categories", label:"Categories", icon:"fa-tags",  render:()=>window.React.createElement(CategoriesTab,null) },
        { key:"settings",   label:"Settings",   icon:"fa-gear",
          render:()=>window.React.createElement(SimpleSettingsPanel,{slug:SLUG,fields:[
            {key:"ticket_limit_per_window",label:"Max tickets per window",type:"number",description:"Maximum number of tickets a member can open within the time window."},
            {key:"ticket_window_hours",    label:"Window (hours)",         type:"number",description:"Rolling time window in hours for the ticket rate limit."},
          ]})
        },
      ],
    });
  }

  // ---------------------------------------------------------------------------
  // Registrations
  // ---------------------------------------------------------------------------

  NE.registerAdminPanel(SLUG, { label:"Nexus Support", icon:"fa-life-ring", component:AdminPanel });

  NE.registerExploreItem({ slug:SLUG, path:"/", label:"Support", icon:"fa-life-ring", priority:50 });

  NE.registerRoute(SLUG, "/",               TicketIndexPage,  { title:"Support" });
  NE.registerRoute(SLUG, "/new",            NewTicketPage,    { title:"New Ticket" });
  NE.registerRoute(SLUG, "/:id",            TicketDetailPage, { title:"Ticket" });
  NE.registerRoute(SLUG, "/status/:filter", FilteredIndexPage,{ title:"Support" });

  NE.registerRightWidget({ slug:SLUG, id:"support-summary", label:"Support", component:SupportWidget, scope:"extension" });

})();

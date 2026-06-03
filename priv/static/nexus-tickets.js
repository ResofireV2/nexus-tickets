(function () {
  "use strict";

  const NE   = window.NexusExtensions;
  const SLUG = "nexus-tickets";
  const { useState, useEffect, useCallback, useRef } = window.React;
  const { TabbedPanel, SimpleSettingsPanel }          = window.NexusExtensionTemplates;
  const { toast }                                     = window.NexusComponents;

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
    if (!res.ok) throw new Error(data.error || "Request failed");
    return data;
  }

  // ---------------------------------------------------------------------------
  // Colour swatch — a small clickable hex-color square
  // ---------------------------------------------------------------------------

  const PRESET_COLORS = [
    "#5B4EF5", "#7C3AED", "#DB2777", "#DC2626",
    "#EA580C", "#D97706", "#16A34A", "#0891B2",
    "#0284C7", "#4F46E5", "#64748B", "#374151",
  ];

  function ColorPicker({ value, onChange }) {
    const [open, setOpen] = useState(false);
    const ref = useRef(null);

    useEffect(() => {
      if (!open) return;
      function handler(e) {
        if (ref.current && !ref.current.contains(e.target)) setOpen(false);
      }
      document.addEventListener("mousedown", handler);
      return () => document.removeEventListener("mousedown", handler);
    }, [open]);

    return window.React.createElement("div", { style: { position: "relative", display: "inline-block" }, ref },
      // Swatch trigger
      window.React.createElement("button", {
        type: "button",
        onClick: () => setOpen(o => !o),
        style: {
          width: 28, height: 28, borderRadius: 6,
          background: value || "#5B4EF5",
          border: "0.5px solid var(--b2)",
          cursor: "pointer", flexShrink: 0,
        }
      }),

      // Dropdown
      open && window.React.createElement("div", {
        style: {
          position: "absolute", top: 34, left: 0, zIndex: 200,
          background: "var(--s2)", border: "0.5px solid var(--b1)",
          borderRadius: 10, padding: 10,
          display: "grid", gridTemplateColumns: "repeat(6, 1fr)", gap: 6,
          boxShadow: "0 4px 16px rgba(0,0,0,0.18)",
        }
      },
        PRESET_COLORS.map(c =>
          window.React.createElement("button", {
            key: c, type: "button",
            onClick: () => { onChange(c); setOpen(false); },
            style: {
              width: 24, height: 24, borderRadius: 5,
              background: c, border: value === c ? "2px solid var(--t1)" : "0.5px solid var(--b2)",
              cursor: "pointer",
            }
          })
        ),
        // Custom hex input
        window.React.createElement("input", {
          type: "text",
          defaultValue: value,
          placeholder: "#rrggbb",
          onBlur: e => {
            const v = e.target.value.trim();
            if (/^#[0-9a-fA-F]{6}$/.test(v)) { onChange(v); setOpen(false); }
          },
          style: {
            gridColumn: "span 6",
            marginTop: 4,
            padding: "4px 8px",
            fontSize: 12,
            borderRadius: 6,
            border: "0.5px solid var(--b2)",
            background: "var(--s1)",
            color: "var(--t1)",
            width: "100%",
            boxSizing: "border-box",
          }
        })
      )
    );
  }

  // ---------------------------------------------------------------------------
  // Category form (create + edit)
  // ---------------------------------------------------------------------------

  function CategoryForm({ initial, onSave, onCancel }) {
    const blank = { name: "", slug: "", description: "", color: "#5B4EF5", icon: "fa-tag" };
    const [form, setForm] = useState(initial || blank);
    const [saving, setSaving] = useState(false);
    const [errors, setErrors] = useState({});

    // Auto-derive slug from name when creating a new category
    const nameRef = useRef(initial ? null : true); // true = auto-slug is active

    function set(key, val) {
      setForm(f => ({ ...f, [key]: val }));
      setErrors(e => ({ ...e, [key]: null }));
    }

    function handleNameChange(val) {
      set("name", val);
      if (!initial && nameRef.current) {
        const slug = val.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        set("slug", slug);
      }
    }

    async function handleSubmit() {
      setSaving(true);
      setErrors({});
      try {
        const result = initial
          ? await api("PATCH", `/admin/categories/${initial.id}`, form)
          : await api("POST",  "/admin/categories", form);
        onSave(result.category);
      } catch (e) {
        // Try to parse field-level errors from the 422 response
        try {
          const parsed = JSON.parse(e.message);
          setErrors(parsed.errors || {});
        } catch (_) {
          toast(e.message, "err");
        }
      } finally {
        setSaving(false);
      }
    }

    const fieldStyle = {
      display: "flex", flexDirection: "column", gap: 4, marginBottom: 16,
    };
    const labelStyle = { fontSize: 12, fontWeight: 500, color: "var(--t3)" };
    const inputStyle = {
      padding: "8px 10px", fontSize: 13, borderRadius: 8,
      border: "0.5px solid var(--b2)", background: "var(--s1)",
      color: "var(--t1)", outline: "none", width: "100%", boxSizing: "border-box",
    };
    const errStyle = { fontSize: 11, color: "var(--red)", marginTop: 2 };

    return window.React.createElement("div", { style: { padding: "4px 0" } },

      // Name
      window.React.createElement("div", { style: fieldStyle },
        window.React.createElement("label", { style: labelStyle }, "Name"),
        window.React.createElement("input", {
          style: { ...inputStyle, borderColor: errors.name ? "var(--red)" : "var(--b2)" },
          value: form.name,
          placeholder: "e.g. Billing",
          onChange: e => handleNameChange(e.target.value),
        }),
        errors.name && window.React.createElement("span", { style: errStyle }, errors.name)
      ),

      // Slug
      window.React.createElement("div", { style: fieldStyle },
        window.React.createElement("label", { style: labelStyle }, "Slug"),
        window.React.createElement("input", {
          style: { ...inputStyle, borderColor: errors.slug ? "var(--red)" : "var(--b2)" },
          value: form.slug,
          placeholder: "e.g. billing",
          onChange: e => { nameRef.current = false; set("slug", e.target.value); },
        }),
        errors.slug && window.React.createElement("span", { style: errStyle }, errors.slug)
      ),

      // Description
      window.React.createElement("div", { style: fieldStyle },
        window.React.createElement("label", { style: labelStyle }, "Description (optional)"),
        window.React.createElement("textarea", {
          style: { ...inputStyle, resize: "vertical", minHeight: 64 },
          value: form.description || "",
          placeholder: "What kinds of tickets belong in this category?",
          onChange: e => set("description", e.target.value),
        })
      ),

      // Color + Icon row
      window.React.createElement("div", { style: { display: "flex", gap: 16, marginBottom: 16 } },
        window.React.createElement("div", { style: { ...fieldStyle, marginBottom: 0, flex: 1 } },
          window.React.createElement("label", { style: labelStyle }, "Color"),
          window.React.createElement("div", { style: { display: "flex", alignItems: "center", gap: 8 } },
            window.React.createElement(ColorPicker, {
              value: form.color,
              onChange: v => set("color", v),
            }),
            window.React.createElement("span", { style: { fontSize: 12, color: "var(--t4)" } }, form.color)
          )
        ),
        window.React.createElement("div", { style: { ...fieldStyle, marginBottom: 0, flex: 1 } },
          window.React.createElement("label", { style: labelStyle }, "Icon (Font Awesome)"),
          window.React.createElement("input", {
            style: inputStyle,
            value: form.icon || "",
            placeholder: "fa-tag",
            onChange: e => set("icon", e.target.value),
          })
        )
      ),

      // Icon preview
      form.icon && window.React.createElement("div", {
        style: {
          display: "flex", alignItems: "center", gap: 8,
          marginBottom: 20, fontSize: 13, color: "var(--t4)",
        }
      },
        window.React.createElement("span", null, "Preview: "),
        window.React.createElement("span", {
          style: {
            display: "inline-flex", alignItems: "center", gap: 6,
            padding: "3px 10px", borderRadius: 20,
            background: (form.color || "#5B4EF5") + "18",
            border: `0.5px solid ${form.color || "#5B4EF5"}40`,
            color: form.color || "#5B4EF5",
            fontSize: 12,
          }
        },
          window.React.createElement("i", { className: `fa-solid ${form.icon}` }),
          form.name || "Category"
        )
      ),

      // Actions
      window.React.createElement("div", { style: { display: "flex", gap: 8, justifyContent: "flex-end" } },
        window.React.createElement("button", {
          type: "button",
          className: "btn-ghost",
          onClick: onCancel,
          disabled: saving,
        }, "Cancel"),
        window.React.createElement("button", {
          type: "button",
          className: "btn-primary",
          onClick: handleSubmit,
          disabled: saving,
        }, saving ? "Saving…" : (initial ? "Save changes" : "Create category"))
      )
    );
  }

  // ---------------------------------------------------------------------------
  // Category row (in the list)
  // ---------------------------------------------------------------------------

  function CategoryRow({ category, onEdit, onDelete, dragHandleProps }) {
    const [confirming, setConfirming] = useState(false);

    return window.React.createElement("div", {
      style: {
        display: "flex", alignItems: "center", gap: 10,
        padding: "10px 14px",
        background: "var(--s2)",
        borderRadius: 10,
        border: "0.5px solid var(--b1)",
      }
    },
      // Drag handle
      window.React.createElement("span", {
        ...dragHandleProps,
        style: {
          cursor: "grab", color: "var(--t5)", fontSize: 13, flexShrink: 0,
          userSelect: "none",
        },
        title: "Drag to reorder",
      },
        window.React.createElement("i", { className: "fa-solid fa-grip-vertical" })
      ),

      // Color dot + icon
      window.React.createElement("span", {
        style: {
          width: 28, height: 28, borderRadius: 7, flexShrink: 0,
          background: (category.color || "#5B4EF5") + "18",
          display: "flex", alignItems: "center", justifyContent: "center",
          color: category.color || "#5B4EF5",
          fontSize: 13,
        }
      },
        window.React.createElement("i", { className: `fa-solid ${category.icon || "fa-tag"}` })
      ),

      // Name + slug
      window.React.createElement("div", { style: { flex: 1, minWidth: 0 } },
        window.React.createElement("div", { style: { fontSize: 13, fontWeight: 500, color: "var(--t1)" } },
          category.name
        ),
        window.React.createElement("div", { style: { fontSize: 11, color: "var(--t5)", marginTop: 1 } },
          category.slug,
          category.description && ` · ${category.description}`
        )
      ),

      // Actions
      confirming
        ? window.React.createElement("div", { style: { display: "flex", gap: 6, alignItems: "center" } },
            window.React.createElement("span", { style: { fontSize: 12, color: "var(--t3)" } }, "Delete?"),
            window.React.createElement("button", {
              type: "button", className: "btn-ghost",
              style: { fontSize: 12, padding: "3px 10px", color: "var(--red)", borderColor: "var(--red)" },
              onClick: () => onDelete(category),
            }, "Yes"),
            window.React.createElement("button", {
              type: "button", className: "btn-ghost",
              style: { fontSize: 12, padding: "3px 10px" },
              onClick: () => setConfirming(false),
            }, "No")
          )
        : window.React.createElement("div", { style: { display: "flex", gap: 6 } },
            window.React.createElement("button", {
              type: "button", className: "btn-ghost",
              style: { fontSize: 12, padding: "3px 10px" },
              onClick: () => onEdit(category),
            }, "Edit"),
            window.React.createElement("button", {
              type: "button", className: "btn-ghost",
              style: { fontSize: 12, padding: "3px 10px", color: "var(--red)", borderColor: "var(--red)" },
              onClick: () => setConfirming(true),
            }, "Delete")
          )
    );
  }

  // ---------------------------------------------------------------------------
  // Categories admin tab
  // ---------------------------------------------------------------------------

  function CategoriesTab() {
    const [categories, setCategories] = useState(null);
    const [creating,   setCreating]   = useState(false);
    const [editing,    setEditing]    = useState(null);  // category object
    const [dragIdx,    setDragIdx]    = useState(null);
    const [overIdx,    setOverIdx]    = useState(null);

    useEffect(() => {
      api("GET", "/admin/categories")
        .then(d => setCategories(d.categories))
        .catch(e => toast(e.message, "err"));
    }, []);

    // ── Drag-to-reorder (native HTML5 drag) ─────────────────────────────────

    function handleDragStart(idx) { setDragIdx(idx); }
    function handleDragOver(idx)  { setOverIdx(idx); }

    async function handleDrop() {
      if (dragIdx == null || overIdx == null || dragIdx === overIdx) {
        setDragIdx(null); setOverIdx(null); return;
      }
      const reordered = [...categories];
      const [moved] = reordered.splice(dragIdx, 1);
      reordered.splice(overIdx, 0, moved);
      setCategories(reordered);
      setDragIdx(null); setOverIdx(null);

      try {
        await api("POST", "/admin/categories/reorder", { ids: reordered.map(c => c.id) });
      } catch (e) {
        toast("Failed to save order: " + e.message, "err");
      }
    }

    // ── CRUD handlers ────────────────────────────────────────────────────────

    function handleCreated(category) {
      setCategories(cs => [...(cs || []), category]);
      setCreating(false);
      toast("Category created");
    }

    function handleUpdated(category) {
      setCategories(cs => cs.map(c => c.id === category.id ? category : c));
      setEditing(null);
      toast("Category updated");
    }

    async function handleDelete(category) {
      try {
        await api("DELETE", `/admin/categories/${category.id}`);
        setCategories(cs => cs.filter(c => c.id !== category.id));
        toast("Category deleted");
      } catch (e) {
        toast(e.message, "err");
      }
    }

    // ── Render ───────────────────────────────────────────────────────────────

    if (categories === null) {
      return window.React.createElement("div", {
        style: { padding: "48px 0", textAlign: "center", color: "var(--t5)" }
      },
        window.React.createElement("i", { className: "fa-solid fa-spinner fa-spin" })
      );
    }

    return window.React.createElement("div", { style: { paddingTop: 8 } },

      // Header row
      window.React.createElement("div", {
        style: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }
      },
        window.React.createElement("div", null,
          window.React.createElement("div", { style: { fontSize: 14, fontWeight: 600, color: "var(--t1)" } },
            "Categories"
          ),
          window.React.createElement("div", { style: { fontSize: 12, color: "var(--t4)", marginTop: 2 } },
            categories.length === 0
              ? "No categories yet. Create one to get started."
              : `${categories.length} categor${categories.length === 1 ? "y" : "ies"} · drag to reorder`
          )
        ),
        !creating && !editing && window.React.createElement("button", {
          type: "button",
          className: "btn-primary",
          style: { fontSize: 12 },
          onClick: () => setCreating(true),
        },
          window.React.createElement("i", { className: "fa-solid fa-plus", style: { marginRight: 6 } }),
          "New category"
        )
      ),

      // Create form
      creating && window.React.createElement("div", {
        style: {
          background: "var(--s2)", border: "0.5px solid var(--b1)",
          borderRadius: 12, padding: 16, marginBottom: 16,
        }
      },
        window.React.createElement("div", { style: { fontSize: 13, fontWeight: 600, color: "var(--t1)", marginBottom: 14 } },
          "New category"
        ),
        window.React.createElement(CategoryForm, {
          onSave: handleCreated,
          onCancel: () => setCreating(false),
        })
      ),

      // Category list
      window.React.createElement("div", { style: { display: "flex", flexDirection: "column", gap: 6 } },
        categories.length === 0 && !creating &&
          window.React.createElement("div", {
            style: {
              padding: "32px 16px", textAlign: "center",
              background: "var(--s2)", border: "0.5px solid var(--b1)",
              borderRadius: 12, color: "var(--t5)", fontSize: 13,
            }
          },
            "No categories yet. Use the button above to create your first one."
          ),

        categories.map((cat, idx) =>
          editing && editing.id === cat.id
            // Inline edit form
            ? window.React.createElement("div", {
                key: cat.id,
                style: {
                  background: "var(--s2)", border: "0.5px solid var(--ac)",
                  borderRadius: 12, padding: 16,
                }
              },
                window.React.createElement("div", { style: { fontSize: 13, fontWeight: 600, color: "var(--t1)", marginBottom: 14 } },
                  "Edit category"
                ),
                window.React.createElement(CategoryForm, {
                  initial: editing,
                  onSave: handleUpdated,
                  onCancel: () => setEditing(null),
                })
              )
            // Normal row
            : window.React.createElement("div", {
                key: cat.id,
                draggable: !creating && !editing,
                onDragStart: () => handleDragStart(idx),
                onDragOver:  e  => { e.preventDefault(); handleDragOver(idx); },
                onDrop:      handleDrop,
                style: {
                  opacity: dragIdx === idx ? 0.4 : 1,
                  outline: overIdx === idx && dragIdx !== idx
                    ? "1.5px dashed var(--ac)" : "none",
                  borderRadius: 10,
                  transition: "opacity 0.15s",
                }
              },
                window.React.createElement(CategoryRow, {
                  category: cat,
                  onEdit:   () => setEditing(cat),
                  onDelete: handleDelete,
                  dragHandleProps: {
                    draggable: false, // handle itself is not draggable — parent div is
                  },
                })
              )
        )
      )
    );
  }

  // ---------------------------------------------------------------------------
  // Admin panel — TabbedPanel with Categories + Settings tabs
  //
  // Settings fields are rendered via SimpleSettingsPanel in the Settings tab.
  // Because we use SimpleSettingsPanel here, those fields must NOT appear in
  // the manifest settings_schema (they are included there for the top-level
  // auto-render). Since we DO want the auto-render of settings (it's simpler),
  // we only put a minimal custom panel for Categories.
  //
  // The guide says: "If you use SimpleSettingsPanel inside your registered
  // admin panel to render settings_schema fields, remove those keys from
  // settings_schema. Otherwise the host auto-renders them a second time."
  //
  // Our approach: Settings tab uses SimpleSettingsPanel with explicit fields,
  // so settings_schema in the manifest is EMPTY — the host renders nothing
  // automatically. All settings are owned by our admin panel.
  // ---------------------------------------------------------------------------

  function AdminPanel() {
    const { TabbedPanel, SimpleSettingsPanel } = window.NexusExtensionTemplates;

    return window.React.createElement(TabbedPanel, {
      tabs: [
        {
          key:    "categories",
          label:  "Categories",
          icon:   "fa-tags",
          render: () => window.React.createElement(CategoriesTab, null),
        },
        {
          key:    "settings",
          label:  "Settings",
          icon:   "fa-gear",
          render: () => window.React.createElement(SimpleSettingsPanel, {
            slug: SLUG,
            fields: [
              {
                key:         "ticket_limit_per_window",
                label:       "Max tickets per window",
                type:        "number",
                description: "Maximum number of tickets a member can open within the time window.",
              },
              {
                key:         "ticket_window_hours",
                label:       "Window (hours)",
                type:        "number",
                description: "Rolling time window in hours for the ticket rate limit.",
              },
            ],
          }),
        },
      ],
    });
  }

  // ---------------------------------------------------------------------------
  // Explore / SPA routes — stubs for Stage 1
  // Routes are registered so the manifest is satisfied; pages show a
  // "coming soon" placeholder until later stages are built.
  // ---------------------------------------------------------------------------

  function ComingSoon({ title }) {
    return window.React.createElement("div", {
      style: {
        maxWidth: 480, margin: "80px auto", textAlign: "center",
        color: "var(--t4)", padding: "0 16px",
      }
    },
      window.React.createElement("i", {
        className: "fa-solid fa-life-ring",
        style: { fontSize: 32, color: "var(--ac)", marginBottom: 16 },
      }),
      window.React.createElement("div", { style: { fontSize: 18, fontWeight: 600, color: "var(--t1)", marginBottom: 8 } },
        title || "Support"
      ),
      window.React.createElement("div", { style: { fontSize: 14 } },
        "This section is being set up. Check back soon."
      )
    );
  }

  // ---------------------------------------------------------------------------
  // Right widget stub — shows during Stage 1
  // ---------------------------------------------------------------------------

  function SupportWidget() {
    return window.React.createElement("div", {
      style: {
        padding: "12px 14px",
        background: "var(--s2)",
        border: "0.5px solid var(--b1)",
        borderRadius: 12,
      }
    },
      window.React.createElement("div", {
        style: { fontSize: 12, fontWeight: 600, color: "var(--t3)", marginBottom: 6 }
      }, "Support"),
      window.React.createElement("div", { style: { fontSize: 12, color: "var(--t5)" } },
        "Support is being configured."
      )
    );
  }

  // ---------------------------------------------------------------------------
  // Registrations
  // ---------------------------------------------------------------------------

  // Admin panel
  NE.registerAdminPanel(SLUG, {
    label:     "Nexus Support",
    icon:      "fa-life-ring",
    component: AdminPanel,
  });

  // Explore entry
  NE.registerExploreItem({
    slug:     SLUG,
    path:     "/",
    label:    "Support",
    icon:     "fa-life-ring",
    priority: 50,
  });

  // Routes — stubs for Stage 1
  NE.registerRoute(SLUG, "/",               ComingSoon, { title: "Support" });
  NE.registerRoute(SLUG, "/new",            ComingSoon, { title: "New Ticket" });
  NE.registerRoute(SLUG, "/:id",            ComingSoon, { title: "Ticket" });
  NE.registerRoute(SLUG, "/status/:filter", ComingSoon, { title: "Support" });

  // Right widget
  NE.registerRightWidget({
    slug:      SLUG,
    id:        "support-summary",
    label:     "Support",
    component: SupportWidget,
    scope:     "extension",
  });

})();

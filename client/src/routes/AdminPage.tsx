import {
  useCallback,
  useEffect,
  useState,
  type FormEvent,
  type PropsWithChildren,
} from "react";
import {
  createAdminUser,
  getAdminConfig,
  getAdminUsers,
  resetAdminUserPassword,
  testAdminConfig,
  updateAdminConfig,
  updateAdminUser,
  type AdminConfig,
  type AdminConfigPayload,
  type AdminUser,
  type ConfigTestKind,
} from "../api/admin.api";
import type { UserRole } from "../api/auth.api";
import MaterialIcon from "../components/common/MaterialIcon";

type Notice = { type: "info" | "success" | "error"; text: string };

type NoticeProps = { notice: Notice };
type ModalProps = PropsWithChildren<{ title: string; onClose: () => void }>;
type FieldProps = PropsWithChildren<{ label: string; hint?: string }>;
type SectionCardProps = PropsWithChildren<{ title: string; description?: string }>;

const PHONE_RE = /^1[3-9]\d{9}$/;
const PAGE_SIZE = 10;

const inputClass =
  "w-full rounded-lg border border-slate-200 bg-slate-50/60 px-3 py-2 text-sm text-black outline-none transition-all placeholder:text-slate-400 focus:border-black focus:bg-white focus:ring-1 focus:ring-black";
const btnPrimary =
  "inline-flex items-center justify-center gap-1.5 rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60";
const btnGhost =
  "inline-flex items-center justify-center rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-black disabled:cursor-not-allowed disabled:opacity-60";
const btnLink = "text-xs font-semibold text-slate-600 transition-colors hover:text-black";
const btnPage =
  "rounded border border-slate-200 px-2.5 py-1 text-xs text-slate-600 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40";

function messageOf(cause: unknown): string {
  return cause instanceof Error ? cause.message : "操作失败，请稍后重试";
}

function formatDate(value?: string): string {
  if (!value) return "-";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN");
}

/** 空字符串表示保持原值；null 由“清空密钥”按钮显式触发。 */
function resolveApiKey(current: string, originalKey: string, cleared: boolean): string | null {
  if (cleared) return null;
  return current === originalKey ? "" : current;
}

function toNumber(value: string): number {
  const trimmed = value.trim();
  return trimmed === "" ? 0 : Number(trimmed);
}

const NoticeBar = ({ notice }: NoticeProps) => {
  const tone =
    notice.type === "error"
      ? "bg-[#ffdad6] text-[#93000a]"
      : notice.type === "success"
        ? "bg-emerald-50 text-emerald-700"
        : "bg-slate-100 text-slate-700";
  return <div className={`mb-5 rounded-lg px-4 py-3 text-sm ${tone}`}>{notice.text}</div>;
};

const Modal = ({ title, onClose, children }: ModalProps) => (
  <div
    className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-4"
    onMouseDown={onClose}
  >
    <div
      className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div className="mb-5 flex items-center justify-between">
        <h3 className="text-lg font-semibold text-black">{title}</h3>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-xl leading-none text-slate-400 transition-colors hover:bg-slate-100 hover:text-black"
          aria-label="关闭"
        >
          ×
        </button>
      </div>
      {children}
    </div>
  </div>
);

const Field = ({ label, hint, children }: FieldProps) => (
  <label className="block">
    <span className="mb-1.5 block text-xs font-semibold text-slate-600">{label}</span>
    {children}
    {hint ? <span className="mt-1 block text-xs text-slate-400">{hint}</span> : null}
  </label>
);

const SectionCard = ({ title, description, children }: SectionCardProps) => (
  <section className="rounded-xl border border-slate-200 bg-white p-5">
    <h3 className="text-sm font-semibold text-black">{title}</h3>
    {description ? <p className="mt-1 text-xs text-slate-400">{description}</p> : null}
    <div className="mt-4 grid gap-4 sm:grid-cols-2">{children}</div>
  </section>
);

type RoleRadioProps = {
  name: string;
  value: UserRole;
  current: UserRole;
  onChange: (role: UserRole) => void;
};

const RoleRadio = ({ name, value, current, onChange }: RoleRadioProps) => (
  <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700">
    <input
      type="radio"
      name={name}
      value={value}
      checked={current === value}
      onChange={() => onChange(value)}
      className="accent-black"
    />
    {value}
  </label>
);

type CreateForm = { phone: string; password: string; displayName: string; role: UserRole };
type EditForm = { displayName: string; role: UserRole };

const emptyCreateForm: CreateForm = { phone: "", password: "", displayName: "", role: "USER" };

type UserManagementProps = { onNotice: (notice: Notice) => void };

const UserManagement = ({ onNotice }: UserManagementProps) => {
  const [items, setItems] = useState<AdminUser[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(false);

  const [createOpen, setCreateOpen] = useState(false);
  const [createForm, setCreateForm] = useState<CreateForm>(emptyCreateForm);
  const [createSubmitting, setCreateSubmitting] = useState(false);

  const [editing, setEditing] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState<EditForm>({ displayName: "", role: "USER" });
  const [editSubmitting, setEditSubmitting] = useState(false);

  const [resetting, setResetting] = useState<AdminUser | null>(null);
  const [newPassword, setNewPassword] = useState("");
  const [resetSubmitting, setResetSubmitting] = useState(false);

  const loadUsers = useCallback(async (targetPage: number) => {
    setLoading(true);
    try {
      const result = await getAdminUsers(targetPage, PAGE_SIZE);
      setItems(result.items ?? []);
      setTotal(result.total ?? 0);
      setPage(result.page ?? targetPage);
    } catch (cause) {
      onNotice({ type: "error", text: messageOf(cause) });
    } finally {
      setLoading(false);
    }
  }, [onNotice]);

  useEffect(() => {
    void loadUsers(1);
  }, [loadUsers]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const phone = createForm.phone.trim();
    if (!PHONE_RE.test(phone)) {
      onNotice({ type: "error", text: "手机号格式不正确，需为 1 开头的 11 位号码" });
      return;
    }
    if (createForm.password.length < 8) {
      onNotice({ type: "error", text: "初始密码至少 8 位" });
      return;
    }
    setCreateSubmitting(true);
    try {
      await createAdminUser({
        phone,
        password: createForm.password,
        displayName: createForm.displayName.trim() || undefined,
        role: createForm.role,
      });
      onNotice({ type: "success", text: "用户创建成功" });
      setCreateOpen(false);
      await loadUsers(1);
    } catch (cause) {
      onNotice({ type: "error", text: messageOf(cause) });
    } finally {
      setCreateSubmitting(false);
    }
  }

  function openEdit(user: AdminUser) {
    setEditing(user);
    setEditForm({ displayName: user.displayName ?? "", role: user.role });
  }

  async function handleEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setEditSubmitting(true);
    try {
      await updateAdminUser(editing.userId, {
        displayName: editForm.displayName.trim() || undefined,
        role: editForm.role,
      });
      onNotice({ type: "success", text: "用户信息已更新" });
      setEditing(null);
      await loadUsers(page);
    } catch (cause) {
      onNotice({ type: "error", text: messageOf(cause) });
    } finally {
      setEditSubmitting(false);
    }
  }

  async function handleReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!resetting) return;
    if (newPassword.length < 8) {
      onNotice({ type: "error", text: "新密码至少 8 位" });
      return;
    }
    setResetSubmitting(true);
    try {
      await resetAdminUserPassword(resetting.userId, { newPassword });
      onNotice({ type: "success", text: "密码已重置" });
      setResetting(null);
    } catch (cause) {
      onNotice({ type: "error", text: messageOf(cause) });
    } finally {
      setResetSubmitting(false);
    }
  }

  async function handleToggle(user: AdminUser) {
    try {
      await updateAdminUser(user.userId, { isActive: !user.isActive });
      onNotice({ type: "success", text: user.isActive ? "用户已禁用" : "用户已启用" });
      await loadUsers(page);
    } catch (cause) {
      onNotice({ type: "error", text: messageOf(cause) });
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-black">用户管理</h2>
          <p className="mt-1 text-xs text-slate-500">共 {total} 个用户 · 第 {page} / {totalPages} 页</p>
        </div>
        <button
          type="button"
          onClick={() => {
            setCreateForm(emptyCreateForm);
            setCreateOpen(true);
          }}
          className={btnPrimary}
        >
          <MaterialIcon name="person_add" className="!text-[18px]" />
          新建用户
        </button>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-4 py-3">手机号</th>
                <th className="px-4 py-3">姓名</th>
                <th className="px-4 py-3">角色</th>
                <th className="px-4 py-3">状态</th>
                <th className="px-4 py-3">创建时间</th>
                <th className="px-4 py-3">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">加载中...</td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-12 text-center text-slate-400">暂无用户</td>
                </tr>
              ) : (
                items.map((user) => (
                  <tr key={user.userId} className="hover:bg-slate-50/60">
                    <td className="px-4 py-3 font-medium text-black">{user.phone}</td>
                    <td className="px-4 py-3 text-slate-600">{user.displayName || "-"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={`rounded px-2 py-0.5 text-xs font-semibold ${
                          user.role === "ADMIN" ? "bg-black text-white" : "bg-slate-100 text-slate-600"
                        }`}
                      >
                        {user.role}
                      </span>
                    </td>
                    <td className={`px-4 py-3 text-xs ${user.isActive ? "text-emerald-600" : "text-slate-400"}`}>
                      {user.isActive ? "启用" : "禁用"}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-500">{formatDate(user.createdAt)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-3">
                        <button type="button" className={btnLink} onClick={() => openEdit(user)}>编辑</button>
                        <button
                          type="button"
                          className={btnLink}
                          onClick={() => {
                            setResetting(user);
                            setNewPassword("");
                          }}
                        >
                          重置密码
                        </button>
                        <button type="button" className={btnLink} onClick={() => void handleToggle(user)}>
                          {user.isActive ? "禁用" : "启用"}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
          <span>每页 {PAGE_SIZE} 条</span>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className={btnPage}
              disabled={page <= 1 || loading}
              onClick={() => void loadUsers(page - 1)}
            >
              上一页
            </button>
            <span>{page} / {totalPages}</span>
            <button
              type="button"
              className={btnPage}
              disabled={page >= totalPages || loading}
              onClick={() => void loadUsers(page + 1)}
            >
              下一页
            </button>
          </div>
        </div>
      </div>

      {createOpen ? (
        <Modal title="新建用户" onClose={() => setCreateOpen(false)}>
          <form onSubmit={handleCreate} className="space-y-4">
            <Field label="手机号">
              <input
                type="tel"
                inputMode="numeric"
                required
                value={createForm.phone}
                onChange={(event) => setCreateForm((current) => ({ ...current, phone: event.target.value }))}
                placeholder="1 开头的 11 位手机号"
                className={inputClass}
              />
            </Field>
            <Field label="姓名">
              <input
                type="text"
                value={createForm.displayName}
                onChange={(event) => setCreateForm((current) => ({ ...current, displayName: event.target.value }))}
                placeholder="可选"
                className={inputClass}
              />
            </Field>
            <Field label="初始密码" hint="至少 8 位">
              <input
                type="password"
                required
                value={createForm.password}
                onChange={(event) => setCreateForm((current) => ({ ...current, password: event.target.value }))}
                placeholder="至少 8 位"
                className={inputClass}
              />
            </Field>
            <div>
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">角色</span>
              <div className="flex gap-6">
                <RoleRadio
                  name="create-role"
                  value="USER"
                  current={createForm.role}
                  onChange={(role) => setCreateForm((current) => ({ ...current, role }))}
                />
                <RoleRadio
                  name="create-role"
                  value="ADMIN"
                  current={createForm.role}
                  onChange={(role) => setCreateForm((current) => ({ ...current, role }))}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className={btnGhost} onClick={() => setCreateOpen(false)}>取消</button>
              <button type="submit" className={btnPrimary} disabled={createSubmitting}>
                {createSubmitting ? "创建中..." : "创建用户"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {editing ? (
        <Modal title="编辑用户" onClose={() => setEditing(null)}>
          <form onSubmit={handleEdit} className="space-y-4">
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              手机号：{editing.phone}
            </div>
            <Field label="姓名">
              <input
                type="text"
                value={editForm.displayName}
                onChange={(event) => setEditForm((current) => ({ ...current, displayName: event.target.value }))}
                placeholder="用户姓名"
                className={inputClass}
              />
            </Field>
            <div>
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">角色</span>
              <div className="flex gap-6">
                <RoleRadio
                  name="edit-role"
                  value="USER"
                  current={editForm.role}
                  onChange={(role) => setEditForm((current) => ({ ...current, role }))}
                />
                <RoleRadio
                  name="edit-role"
                  value="ADMIN"
                  current={editForm.role}
                  onChange={(role) => setEditForm((current) => ({ ...current, role }))}
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className={btnGhost} onClick={() => setEditing(null)}>取消</button>
              <button type="submit" className={btnPrimary} disabled={editSubmitting}>
                {editSubmitting ? "保存中..." : "保存"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}

      {resetting ? (
        <Modal title="重置密码" onClose={() => setResetting(null)}>
          <form onSubmit={handleReset} className="space-y-4">
            <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              用户：{resetting.displayName || resetting.phone}
            </div>
            <Field label="新密码" hint="至少 8 位">
              <input
                type="password"
                required
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                placeholder="至少 8 位"
                className={inputClass}
              />
            </Field>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className={btnGhost} onClick={() => setResetting(null)}>取消</button>
              <button type="submit" className={btnPrimary} disabled={resetSubmitting}>
                {resetSubmitting ? "重置中..." : "确认重置"}
              </button>
            </div>
          </form>
        </Modal>
      ) : null}
    </div>
  );
};

type ConfigForm = {
  llm: { apiKey: string; baseUrl: string; model: string; temperature: string };
  embedding: { provider: "zhipu" | "openai"; apiKey: string; model: string; baseUrl: string };
  retrieval: { topK: string; scoreThreshold: string; contextMessageLimit: string };
  chunk: { chunkSize: string; chunkOverlap: string; embeddingBatchSize: string };
};

function toForm(config: AdminConfig): ConfigForm {
  return {
    llm: {
      apiKey: config.llm?.apiKey ?? "",
      baseUrl: config.llm?.baseUrl ?? "",
      model: config.llm?.model ?? "",
      temperature: String(config.llm?.temperature ?? ""),
    },
    embedding: {
      provider: config.embedding?.provider ?? "zhipu",
      apiKey: config.embedding?.apiKey ?? "",
      model: config.embedding?.model ?? "",
      baseUrl: config.embedding?.baseUrl ?? "",
    },
    retrieval: {
      topK: String(config.retrieval?.topK ?? ""),
      scoreThreshold: String(config.retrieval?.scoreThreshold ?? ""),
      contextMessageLimit: String(config.retrieval?.contextMessageLimit ?? ""),
    },
    chunk: {
      chunkSize: String(config.chunk?.chunkSize ?? ""),
      chunkOverlap: String(config.chunk?.chunkOverlap ?? ""),
      embeddingBatchSize: String(config.chunk?.embeddingBatchSize ?? ""),
    },
  };
}

type ConfigManagementProps = { onNotice: (notice: Notice) => void };

const ConfigManagement = ({ onNotice }: ConfigManagementProps) => {
  const [original, setOriginal] = useState<AdminConfig | null>(null);
  const [form, setForm] = useState<ConfigForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [testing, setTesting] = useState<ConfigTestKind | null>(null);
  const [llmKeyCleared, setLlmKeyCleared] = useState(false);
  const [embeddingKeyCleared, setEmbeddingKeyCleared] = useState(false);

  const loadConfig = useCallback(async () => {
    setLoading(true);
    try {
      const config = await getAdminConfig();
      setOriginal(config);
      setForm(toForm(config));
      setLlmKeyCleared(false);
      setEmbeddingKeyCleared(false);
    } catch (cause) {
      onNotice({ type: "error", text: messageOf(cause) });
    } finally {
      setLoading(false);
    }
  }, [onNotice]);

  useEffect(() => {
    void loadConfig();
  }, [loadConfig]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!original || !form) return;

    const threshold = Number(form.retrieval.scoreThreshold);
    if (!Number.isFinite(threshold) || threshold < 0 || threshold > 1) {
      onNotice({ type: "error", text: "scoreThreshold 必须是 0 到 1 之间的数字" });
      return;
    }

    const payload: AdminConfigPayload = {
      llm: {
        apiKey: resolveApiKey(form.llm.apiKey, original.llm?.apiKey ?? "", llmKeyCleared),
        baseUrl: form.llm.baseUrl.trim(),
        model: form.llm.model.trim(),
        temperature: toNumber(form.llm.temperature),
      },
      embedding: {
        provider: form.embedding.provider,
        apiKey: resolveApiKey(form.embedding.apiKey, original.embedding?.apiKey ?? "", embeddingKeyCleared),
        model: form.embedding.model.trim(),
        baseUrl: form.embedding.baseUrl.trim(),
      },
      retrieval: {
        topK: toNumber(form.retrieval.topK),
        scoreThreshold: threshold,
        contextMessageLimit: toNumber(form.retrieval.contextMessageLimit),
      },
      chunk: {
        chunkSize: toNumber(form.chunk.chunkSize),
        chunkOverlap: toNumber(form.chunk.chunkOverlap),
        embeddingBatchSize: toNumber(form.chunk.embeddingBatchSize),
      },
    };

    setSubmitting(true);
    try {
      await updateAdminConfig(payload);
      onNotice({ type: "success", text: "配置已保存" });
      await loadConfig();
    } catch (cause) {
      onNotice({ type: "error", text: messageOf(cause) });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleTest(kind: ConfigTestKind) {
    setTesting(kind);
    try {
      const result = await testAdminConfig(kind);
      const label = kind === "llm" ? "LLM" : "Embedding";
      onNotice({
        type: result.reachable ? "success" : "error",
        text: `${label} ${result.reachable ? "连接正常" : "连接失败"}：${result.message || "无详细信息"}`,
      });
    } catch (cause) {
      onNotice({ type: "error", text: messageOf(cause) });
    } finally {
      setTesting(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
        提示：切换 Embedding 模型后需重新上传文档索引，否则检索结果可能与新模型不匹配。
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-black">模型配置</h2>
          <p className="mt-1 text-xs text-slate-500">
            LLM {original?.configured?.llm ? "已配置" : "未配置"} · Embedding {original?.configured?.embedding ? "已配置" : "未配置"}
          </p>
        </div>
        <button type="button" className={btnGhost} onClick={() => void loadConfig()}>刷新配置</button>
      </div>

      {loading || !form ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-12 text-center text-sm text-slate-400">
          配置加载中...
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-5">
          <SectionCard title="LLM" description="大语言模型连接参数">
            <div className="sm:col-span-2">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">API Key</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={form.llm.apiKey}
                  onChange={(event) => {
                    setForm((current) => current ? ({
                      ...current,
                      llm: { ...current.llm, apiKey: event.target.value },
                    }) : current);
                    setLlmKeyCleared(false);
                  }}
                  placeholder="留空表示不修改"
                  className={inputClass}
                />
                <button
                  type="button"
                  className={btnGhost}
                  onClick={() => {
                    setForm((current) => current ? ({
                      ...current,
                      llm: { ...current.llm, apiKey: "" },
                    }) : current);
                    setLlmKeyCleared(true);
                  }}
                >
                  清空密钥
                </button>
              </div>
              <span className="mt-1 block text-xs text-slate-400">
                {llmKeyCleared ? "已标记为清空，保存后生效" : "显示值为脱敏串，留空表示不修改"}
              </span>
            </div>
            <Field label="Base URL">
              <input
                type="text"
                value={form.llm.baseUrl}
                onChange={(event) => setForm((current) => current ? ({
                  ...current,
                  llm: { ...current.llm, baseUrl: event.target.value },
                }) : current)}
                placeholder="https://..."
                className={inputClass}
              />
            </Field>
            <Field label="Model">
              <input
                type="text"
                value={form.llm.model}
                onChange={(event) => setForm((current) => current ? ({
                  ...current,
                  llm: { ...current.llm, model: event.target.value },
                }) : current)}
                placeholder="模型名称"
                className={inputClass}
              />
            </Field>
            <Field label="Temperature">
              <input
                type="number"
                step="0.01"
                value={form.llm.temperature}
                onChange={(event) => setForm((current) => current ? ({
                  ...current,
                  llm: { ...current.llm, temperature: event.target.value },
                }) : current)}
                className={inputClass}
              />
            </Field>
          </SectionCard>

          <SectionCard title="Embedding" description="向量模型连接参数">
            <Field label="Provider">
              <select
                value={form.embedding.provider}
                onChange={(event) => setForm((current) => current ? ({
                  ...current,
                  embedding: { ...current.embedding, provider: event.target.value as "zhipu" | "openai" },
                }) : current)}
                className={inputClass}
              >
                <option value="zhipu">zhipu</option>
                <option value="openai">openai</option>
              </select>
            </Field>
            <div className="sm:col-span-2">
              <span className="mb-1.5 block text-xs font-semibold text-slate-600">API Key</span>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={form.embedding.apiKey}
                  onChange={(event) => {
                    setForm((current) => current ? ({
                      ...current,
                      embedding: { ...current.embedding, apiKey: event.target.value },
                    }) : current);
                    setEmbeddingKeyCleared(false);
                  }}
                  placeholder="留空表示不修改"
                  className={inputClass}
                />
                <button
                  type="button"
                  className={btnGhost}
                  onClick={() => {
                    setForm((current) => current ? ({
                      ...current,
                      embedding: { ...current.embedding, apiKey: "" },
                    }) : current);
                    setEmbeddingKeyCleared(true);
                  }}
                >
                  清空密钥
                </button>
              </div>
              <span className="mt-1 block text-xs text-slate-400">
                {embeddingKeyCleared ? "已标记为清空，保存后生效" : "显示值为脱敏串，留空表示不修改"}
              </span>
            </div>
            <Field label="Model">
              <input
                type="text"
                value={form.embedding.model}
                onChange={(event) => setForm((current) => current ? ({
                  ...current,
                  embedding: { ...current.embedding, model: event.target.value },
                }) : current)}
                placeholder="模型名称"
                className={inputClass}
              />
            </Field>
            <Field label="Base URL">
              <input
                type="text"
                value={form.embedding.baseUrl}
                onChange={(event) => setForm((current) => current ? ({
                  ...current,
                  embedding: { ...current.embedding, baseUrl: event.target.value },
                }) : current)}
                placeholder="https://..."
                className={inputClass}
              />
            </Field>
          </SectionCard>

          <SectionCard title="检索" description="召回与上下文参数">
            <Field label="Top K">
              <input
                type="number"
                min="1"
                value={form.retrieval.topK}
                onChange={(event) => setForm((current) => current ? ({
                  ...current,
                  retrieval: { ...current.retrieval, topK: event.target.value },
                }) : current)}
                className={inputClass}
              />
            </Field>
            <Field label="Score Threshold" hint="取值范围 0 到 1">
              <input
                type="number"
                step="0.01"
                min="0"
                max="1"
                value={form.retrieval.scoreThreshold}
                onChange={(event) => setForm((current) => current ? ({
                  ...current,
                  retrieval: { ...current.retrieval, scoreThreshold: event.target.value },
                }) : current)}
                className={inputClass}
              />
            </Field>
            <Field label="Context Message Limit">
              <input
                type="number"
                min="0"
                value={form.retrieval.contextMessageLimit}
                onChange={(event) => setForm((current) => current ? ({
                  ...current,
                  retrieval: { ...current.retrieval, contextMessageLimit: event.target.value },
                }) : current)}
                className={inputClass}
              />
            </Field>
          </SectionCard>

          <SectionCard title="切块" description="文档切分与批处理参数">
            <Field label="Chunk Size">
              <input
                type="number"
                min="1"
                value={form.chunk.chunkSize}
                onChange={(event) => setForm((current) => current ? ({
                  ...current,
                  chunk: { ...current.chunk, chunkSize: event.target.value },
                }) : current)}
                className={inputClass}
              />
            </Field>
            <Field label="Chunk Overlap">
              <input
                type="number"
                min="0"
                value={form.chunk.chunkOverlap}
                onChange={(event) => setForm((current) => current ? ({
                  ...current,
                  chunk: { ...current.chunk, chunkOverlap: event.target.value },
                }) : current)}
                className={inputClass}
              />
            </Field>
            <Field label="Embedding Batch Size">
              <input
                type="number"
                min="1"
                value={form.chunk.embeddingBatchSize}
                onChange={(event) => setForm((current) => current ? ({
                  ...current,
                  chunk: { ...current.chunk, embeddingBatchSize: event.target.value },
                }) : current)}
                className={inputClass}
              />
            </Field>
          </SectionCard>

          <div className="flex flex-wrap items-center gap-3 pb-2">
            <button type="submit" className={btnPrimary} disabled={submitting}>
              {submitting ? "保存中..." : "保存配置"}
            </button>
            <button type="button" className={btnGhost} disabled={testing !== null} onClick={() => void handleTest("llm")}>
              {testing === "llm" ? "测试中..." : "测试 LLM 连接"}
            </button>
            <button type="button" className={btnGhost} disabled={testing !== null} onClick={() => void handleTest("embedding")}>
              {testing === "embedding" ? "测试中..." : "测试 Embedding 连接"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
};

const AdminPage = () => {
  const [tab, setTab] = useState<"users" | "config">("users");
  const [notice, setNotice] = useState<Notice | null>(null);

  const tabClass = (active: boolean) =>
    `rounded-lg px-5 py-2 text-sm font-semibold transition-all ${
      active ? "bg-white text-black shadow-sm" : "text-slate-500 hover:text-black"
    }`;

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 md:px-10">
      <div className="mb-6">
        <h1 className="font-headline text-2xl font-bold tracking-tight text-black">管理后台</h1>
        <p className="mt-1 text-sm text-slate-500">企业内部用户与模型配置管理</p>
      </div>

      <div className="mb-6 flex w-fit gap-1 rounded-xl bg-slate-100 p-1">
        <button
          type="button"
          className={tabClass(tab === "users")}
          onClick={() => {
            setTab("users");
            setNotice(null);
          }}
        >
          用户管理
        </button>
        <button
          type="button"
          className={tabClass(tab === "config")}
          onClick={() => {
            setTab("config");
            setNotice(null);
          }}
        >
          模型配置
        </button>
      </div>

      {notice ? <NoticeBar notice={notice} /> : null}

      {tab === "users" ? (
        <UserManagement onNotice={setNotice} />
      ) : (
        <ConfigManagement onNotice={setNotice} />
      )}
    </div>
  );
};

export default AdminPage;

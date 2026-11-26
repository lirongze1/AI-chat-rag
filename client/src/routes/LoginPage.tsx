import { useState, type FormEvent } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { getAuthToken } from "../api/httpClient";
import MaterialIcon from "../components/common/MaterialIcon";
import { useAuth } from "../context/AuthContext";

const LoginPage = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const [account, setAccount] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const state = location.state as { from?: string } | null;
  const redirectTo = state?.from || "/chat";

  if (getAuthToken()) {
    return <Navigate to={redirectTo} replace />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      await login(account.trim(), password);
      navigate(redirectTo, { replace: true });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "操作失败，请稍后重试");
    } finally {
      setSubmitting(false);
    }
  }

  const inputClass =
    "w-full rounded-lg border border-slate-200 bg-slate-50/60 px-4 py-2.5 text-sm text-black outline-none transition-all placeholder:text-slate-400 focus:border-black focus:bg-white focus:ring-1 focus:ring-black";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f7f9fb] px-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-100 bg-white px-8 py-9 shadow-sm">
        <div className="mb-7 text-center">
          <div className="mb-3 flex justify-center text-black">
            <MaterialIcon name="auto_awesome" className="!text-4xl" filled />
          </div>
          <h1 className="font-headline text-2xl font-bold tracking-tight text-black">Cognitive Architect</h1>
          <p className="mt-1 text-sm text-slate-500">登录以继续你的知识库与对话</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">手机号</span>
            <input
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              required
              value={account}
              onChange={(event) => setAccount(event.target.value)}
              placeholder="请输入手机号"
              className={inputClass}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">密码</span>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="请输入密码"
              className={inputClass}
            />
          </label>

          {error ? (
            <div className="rounded-lg bg-[#ffdad6] px-4 py-2.5 text-sm text-[#93000a]">{error}</div>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-lg bg-black px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? "请稍候..." : "登录"}
          </button>
        </form>
      </div>
    </div>
  );
};

export default LoginPage;

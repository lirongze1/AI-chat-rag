import { useNavigate } from "react-router-dom";
import MaterialIcon from "../common/MaterialIcon";
import { useAuth } from "../../context/AuthContext";
import { useKnowledgeSearch } from "../../context/KnowledgeSearchContext";

type TopHeaderProps = {
  active: "chat" | "knowledge";
};

const TopHeader = ({ active }: TopHeaderProps) => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { query, setQuery } = useKnowledgeSearch();

  const navClass = (isActive: boolean) =>
    isActive
      ? "text-black font-semibold text-sm border-b-2 border-black h-16 flex items-center"
      : "text-slate-400 font-medium text-sm hover:text-black transition-colors h-16 flex items-center";

  function handleLogout() {
    logout();
    navigate("/login", { replace: true });
  }

  return (
    <header className="fixed top-0 z-50 flex h-16 w-full items-center justify-between border-b border-slate-100 bg-white/80 px-8 backdrop-blur-md">
      <div className="flex items-center gap-12">
        <span className="font-headline text-lg font-bold tracking-tight text-black">Cognitive Architect</span>
        <nav className="hidden h-full items-center gap-8 md:flex">
          <button
            type="button"
            onClick={() => navigate("/chat")}
            className={navClass(active === "chat")}
          >
            AI Chat
          </button>
          <button
            type="button"
            onClick={() => navigate("/knowledge-base")}
            className={navClass(active === "knowledge")}
          >
            Knowledge Base
          </button>
        </nav>
      </div>
      <div className="flex items-center gap-4">
        {active === "knowledge" ? (
          <label className="hidden items-center gap-2 lg:flex">
            <MaterialIcon name="search" className="!text-lg text-slate-400" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索知识库文件..."
              className="w-52 rounded-lg border border-slate-100 bg-slate-50 px-4 py-1.5 text-sm outline-none transition-all focus:ring-1 focus:ring-black"
            />
          </label>
        ) : null}
        <div className="hidden items-center gap-2 border-l border-slate-100 pl-4 sm:flex">
          <MaterialIcon name="account_circle" className="!text-xl text-slate-400" />
          <span className="max-w-48 truncate text-sm font-medium text-slate-600" title={user?.email}>
            {user?.email || "..."}
          </span>
          <button
            type="button"
            onClick={handleLogout}
            className="ml-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:bg-slate-100 hover:text-black"
          >
            退出登录
          </button>
        </div>
      </div>
    </header>
  );
};

export default TopHeader;

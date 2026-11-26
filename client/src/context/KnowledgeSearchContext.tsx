import { createContext, useContext, useMemo, useState, type PropsWithChildren } from "react";

type KnowledgeSearchContextValue = {
  query: string;
  setQuery: (query: string) => void;
};

const KnowledgeSearchContext = createContext<KnowledgeSearchContextValue | null>(null);

/** 顶栏搜索框与知识库列表之间共享的轻量查询状态。 */
export function KnowledgeSearchProvider({ children }: PropsWithChildren) {
  const [query, setQuery] = useState("");
  const value = useMemo<KnowledgeSearchContextValue>(() => ({ query, setQuery }), [query]);

  return (
    <KnowledgeSearchContext.Provider value={value}>
      {children}
    </KnowledgeSearchContext.Provider>
  );
}

export function useKnowledgeSearch(): KnowledgeSearchContextValue {
  const context = useContext(KnowledgeSearchContext);
  if (!context) {
    throw new Error("useKnowledgeSearch must be used within KnowledgeSearchProvider");
  }
  return context;
}

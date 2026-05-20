import React, { createContext, useCallback, useContext, useState } from 'react';
import { menusService, type ChefMenu } from '../services/menus';

interface ChefMenuContextValue {
  menus: ChefMenu[];
  refresh: () => Promise<void>;
  reorderMenus: (menuIds: string[]) => Promise<void>;
  setMenus: React.Dispatch<React.SetStateAction<ChefMenu[]>>;
}

const ChefMenuContext = createContext<ChefMenuContextValue | null>(null);

export function ChefMenuProvider({ children }: { children: React.ReactNode }) {
  const [menus, setMenus] = useState<ChefMenu[]>([]);

  const refresh = useCallback(async () => {
    try {
      const m = await menusService.listOwn();
      setMenus(m);
    } catch {
      // silent — caller retains stale state
    }
  }, []);

  const reorderMenus = useCallback(
    async (menuIds: string[]) => {
      await menusService.reorder(menuIds);
      await refresh();
    },
    [refresh],
  );

  return (
    <ChefMenuContext.Provider value={{ menus, refresh, reorderMenus, setMenus }}>
      {children}
    </ChefMenuContext.Provider>
  );
}

export function useChefMenus(): ChefMenuContextValue {
  const ctx = useContext(ChefMenuContext);
  if (!ctx) throw new Error('useChefMenus must be used inside ChefMenuProvider');
  return ctx;
}

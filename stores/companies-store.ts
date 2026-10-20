import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import {
  COMPANIES,
  COMPANY_DOMAINS,
  type Company,
  type SortKey,
} from "@/data/companies";
import { NOTIFICATIONS } from "@/data/notifications";
import {
  DEFAULT_FILTERS,
  defaultSortDir,
  type SortDir,
  type View,
} from "@/lib/companies";

type CompaniesState = {
  companies: Company[];
  sortBy: SortKey;
  sortDir: SortDir;
  view: View;
  owner: string;
  stage: string;
  activityWindow: number;
  selectedIds: string[];
  detailId: string | null;
  detailOpen: boolean;
  profileName: string | null;
  profileOpen: boolean;
  newCompanyOpen: boolean;
  sidebarOpen: boolean;
  searchOpen: boolean;
  shortcutsOpen: boolean;
  unreadNotificationIds: string[];
  density: Density;
  setSortBy: (sortBy: SortKey) => void;
  setOwner: (owner: string) => void;
  setStage: (stage: string) => void;
  setActivityWindow: (days: number) => void;
  resetFilters: () => void;
  toggleSelected: (id: string) => void;
  setSelected: (ids: string[]) => void;
  openDetail: (id: string) => void;
  closeDetail: () => void;
  openProfile: (name: string) => void;
  closeProfile: () => void;
  setNewCompanyOpen: (open: boolean) => void;
  setSidebarOpen: (open: boolean) => void;
  setSearchOpen: (open: boolean) => void;
  setShortcutsOpen: (open: boolean) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  setView: (view: View) => void;
  toggleSort: (key: SortKey) => void;
  setDensity: (density: Density) => void;
  addCompany: (company: Company) => Undo;
  deleteCompanies: (ids: string[]) => Undo;
  assignOwner: (ids: string[], owner: string) => Undo;
};

type Undo = () => void;

export type Density = "comfortable" | "compact";

type PersistedState = Pick<
  CompaniesState,
  "companies" | "unreadNotificationIds" | "density"
>;

const safeLocalStorage = createJSONStorage<PersistedState>(() => ({
  getItem: (key) => localStorage.getItem(key),
  setItem: (key, value) => {
    try {
      localStorage.setItem(key, value);
    } catch {}
  },
  removeItem: (key) => localStorage.removeItem(key),
}));

export const useCompaniesStore = create<CompaniesState>()(
  persist(
    (set, get) => ({
      companies: COMPANIES,
      ...DEFAULT_FILTERS,
      selectedIds: ["microsoft"],
      detailId: null,
      detailOpen: false,
      profileName: null,
      profileOpen: false,
      newCompanyOpen: false,
      sidebarOpen: false,
      searchOpen: false,
      shortcutsOpen: false,
      unreadNotificationIds: NOTIFICATIONS.filter((item) => item.unread).map(
        (item) => item.id,
      ),
      density: "comfortable",
      setSortBy: (sortBy) => set({ sortBy, sortDir: defaultSortDir(sortBy) }),
      setOwner: (owner) => set({ owner }),
      setStage: (stage) => set({ stage }),
      setActivityWindow: (activityWindow) => set({ activityWindow }),
      resetFilters: () => set({ ...DEFAULT_FILTERS }),
      toggleSelected: (id) =>
        set((state) => ({
          selectedIds: state.selectedIds.includes(id)
            ? state.selectedIds.filter((selected) => selected !== id)
            : [...state.selectedIds, id],
        })),
      setSelected: (selectedIds) => set({ selectedIds }),
      openDetail: (detailId) =>
        set({ detailId, detailOpen: true, profileOpen: false }),
      closeDetail: () => set({ detailOpen: false }),
      openProfile: (profileName) =>
        set({ profileName, profileOpen: true, detailOpen: false }),
      closeProfile: () => set({ profileOpen: false }),
      setNewCompanyOpen: (newCompanyOpen) => set({ newCompanyOpen }),
      setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
      setSearchOpen: (searchOpen) => set({ searchOpen }),
      setShortcutsOpen: (shortcutsOpen) => set({ shortcutsOpen }),
      markNotificationRead: (id) =>
        set((state) => ({
          unreadNotificationIds: state.unreadNotificationIds.filter(
            (unread) => unread !== id,
          ),
        })),
      markAllNotificationsRead: () => set({ unreadNotificationIds: [] }),
      setView: (view) => set({ view }),
      toggleSort: (key) =>
        set((state) =>
          state.sortBy === key
            ? { sortDir: state.sortDir === "asc" ? "desc" : "asc" }
            : { sortBy: key, sortDir: defaultSortDir(key) },
        ),
      setDensity: (density) => set({ density }),
      addCompany: (company) => {
        set((state) => ({
          companies: [company, ...state.companies],
          newCompanyOpen: false,
        }));
        return () => get().deleteCompanies([company.id]);
      },
      deleteCompanies: (ids) => {
        const removed = get()
          .companies.map((company, index) => ({ company, index }))
          .filter(({ company }) => ids.includes(company.id));
        set((state) => ({
          companies: state.companies.filter(
            (company) => !ids.includes(company.id),
          ),
          selectedIds: state.selectedIds.filter((id) => !ids.includes(id)),
          detailOpen: state.detailOpen && !ids.includes(state.detailId ?? ""),
        }));
        return () =>
          set((state) => {
            const companies = [...state.companies];
            for (const { company, index } of removed) {
              companies.splice(Math.min(index, companies.length), 0, company);
            }
            return { companies };
          });
      },
      assignOwner: (ids, owner) => {
        const previous = new Map(
          get()
            .companies.filter((company) => ids.includes(company.id))
            .map((company) => [company.id, company.owner]),
        );
        set((state) => ({
          companies: state.companies.map((company) =>
            ids.includes(company.id) ? { ...company, owner } : company,
          ),
        }));
        return () =>
          set((state) => ({
            companies: state.companies.map((company) =>
              previous.has(company.id)
                ? { ...company, owner: previous.get(company.id)! }
                : company,
            ),
          }));
      },
    }),
    {
      name: "sales-crm",
      version: 2,
      migrate: (persisted, version) => {
        const saved = persisted as Partial<PersistedState>;
        if (version < 2 && saved.companies) {
          saved.companies = saved.companies.map((company) => ({
            ...company,
            domain: company.domain ?? COMPANY_DOMAINS[company.id],
            logo: company.logo?.startsWith("/assets/")
              ? undefined
              : company.logo,
          }));
        }
        return saved as PersistedState;
      },
      storage: safeLocalStorage,
      skipHydration: true,
      partialize: (state) => ({
        companies: state.companies,
        unreadNotificationIds: state.unreadNotificationIds,
        density: state.density,
      }),
      merge: (persisted, current) => {
        const saved = persisted as Partial<PersistedState> | undefined;
        const companies = saved?.companies ?? current.companies;
        return {
          ...current,
          ...saved,
          selectedIds: current.selectedIds.filter((id) =>
            companies.some((company) => company.id === id),
          ),
        };
      },
    },
  ),
);

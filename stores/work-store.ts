import { create } from "zustand";
import type { DealStage, TaskStatus } from "@/lib/work";

export type DealDialogState =
  | { mode: "new"; stage?: DealStage; companyId?: string }
  | { mode: "edit"; id: string }
  | null;

export type TaskDialogState =
  | {
      mode: "new";
      status?: TaskStatus;
      companyId?: string;
      contactId?: string;
      dealId?: string;
    }
  | { mode: "edit"; id: string }
  | null;

type WorkState = {
  dealDialog: DealDialogState;
  taskDialog: TaskDialogState;
  openDealDialog: (state: Exclude<DealDialogState, null>) => void;
  openTaskDialog: (state: Exclude<TaskDialogState, null>) => void;
  closeDealDialog: () => void;
  closeTaskDialog: () => void;
};

export const useWorkStore = create<WorkState>((set) => ({
  dealDialog: null,
  taskDialog: null,
  openDealDialog: (dealDialog) => set({ dealDialog }),
  openTaskDialog: (taskDialog) => set({ taskDialog }),
  closeDealDialog: () => set({ dealDialog: null }),
  closeTaskDialog: () => set({ taskDialog: null }),
}));

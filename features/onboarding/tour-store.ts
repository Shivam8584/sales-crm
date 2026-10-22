import { create } from "zustand";

type TourState = {
  open: boolean;
  replay: () => void;
  close: () => void;
};

export const useTour = create<TourState>((set) => ({
  open: false,
  replay: () => set({ open: true }),
  close: () => set({ open: false }),
}));

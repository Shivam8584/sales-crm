import type { Money } from "../../lib/domain/money";
import { invalid } from "./errors";

export function assertMoney(value: Money, field: string) {
  if (!Number.isSafeInteger(value.amount) || value.amount < 0) {
    invalid(field, "Enter a positive amount");
  }
  return value;
}

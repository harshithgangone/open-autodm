'use client';

/**
 * Resolves the UI's active Instagram account.
 *
 * Falls back to the first connected account when nothing is stored (or the
 * stored account was disconnected). The resolved id is only ever one of the
 * user's own accounts, and the server independently re-verifies ownership of
 * any accountId it receives.
 */

import { useInstagramAccounts, type InstagramAccount } from '@/hooks/useInstagramAccounts';
import { useAccountStore } from '@/lib/store';

export function useActiveAccount(): {
  account: InstagramAccount | null;
  accountId: string | null;
  accounts: InstagramAccount[];
  isLoading: boolean;
  setActiveAccount: (id: string | null) => void;
} {
  const { data: accounts, isLoading } = useInstagramAccounts();
  const { activeAccountId, setActiveAccount } = useAccountStore();

  const list = accounts ?? [];
  const account = list.find((a) => a.id === activeAccountId) ?? list[0] ?? null;

  return {
    account,
    accountId: account?.id ?? null,
    accounts: list,
    isLoading,
    setActiveAccount,
  };
}

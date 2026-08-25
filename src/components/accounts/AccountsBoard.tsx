import { Plus } from "lucide-react";
import type { AccountWithRelations, ViewMode } from "../../types";
import { AccountCard } from "./AccountCard";
import { AccountsListView } from "./AccountsListView";
import { EmptyState } from "../ui/EmptyState";
import { Button } from "../ui/Button";

interface Props {
  accounts: AccountWithRelations[];
  viewMode: ViewMode;
  onOpenDetail: (account: AccountWithRelations) => void;
  onEdit: (account: AccountWithRelations) => void;
  onToggleFavorite: (account: AccountWithRelations) => void;
  emptyTitle: string;
  emptyDescription: string;
  onAddAccount: () => void;
}

export function AccountsBoard({
  accounts,
  viewMode,
  onOpenDetail,
  onEdit,
  onToggleFavorite,
  emptyTitle,
  emptyDescription,
  onAddAccount,
}: Props) {
  if (accounts.length === 0) {
    return (
      <EmptyState
        title={emptyTitle}
        description={emptyDescription}
        action={
          <Button variant="primary" onClick={onAddAccount}>
            <Plus size={15} /> Adicionar conta
          </Button>
        }
      />
    );
  }

  if (viewMode === "list") {
    return <AccountsListView accounts={accounts} onOpenDetail={onOpenDetail} onEdit={onEdit} onToggleFavorite={onToggleFavorite} />;
  }

  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {accounts.map((account) => (
        <AccountCard
          key={account.id}
          account={account}
          onOpenDetail={() => onOpenDetail(account)}
          onEdit={() => onEdit(account)}
          onToggleFavorite={() => onToggleFavorite(account)}
        />
      ))}
    </div>
  );
}

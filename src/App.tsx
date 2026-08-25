import { useEffect, useMemo, useState } from "react";
import { Sidebar } from "./components/layout/Sidebar";
import { TopBar } from "./components/layout/TopBar";
import { CategoryCard } from "./components/layout/CategoryCard";
import { AccountsBoard } from "./components/accounts/AccountsBoard";
import { AccountForm } from "./components/accounts/AccountForm";
import { AccountDetailModal } from "./components/accounts/AccountDetailModal";
import { PlatformManagerModal } from "./components/platforms/PlatformManagerModal";
import { PlatformForm, type PlatformFormValues } from "./components/platforms/PlatformForm";
import { SettingsView } from "./components/settings/SettingsView";
import { CreateMasterPassword } from "./components/vault/CreateMasterPassword";
import { UnlockScreen } from "./components/vault/UnlockScreen";
import { ConfirmDialog } from "./components/ui/ConfirmDialog";
import { ToastContainer } from "./components/ui/Toast";
import { useVaultStore } from "./store/useVaultStore";
import { useSettingsStore } from "./store/useSettingsStore";
import { useToastStore } from "./store/useToastStore";
import { useLibrary } from "./lib/useLibrary";
import { useAutoLock } from "./lib/useAutoLock";
import { matchesSearch } from "./lib/filter";
import { createAccount, createPlatform, deleteAccount, toggleFavorite, updateAccount } from "./lib/db";
import { secretCommands } from "./lib/tauri";
import type { AccountFormValues, AccountWithRelations, ViewState } from "./types";

function App() {
  const vaultStatus = useVaultStore((s) => s.status);
  const refreshVault = useVaultStore((s) => s.refresh);
  const lock = useVaultStore((s) => s.lock);
  const settings = useSettingsStore();
  const push = useToastStore((s) => s.push);

  const unlocked = vaultStatus === "unlocked";
  const library = useLibrary(unlocked);

  const [view, setView] = useState<ViewState>({ type: "dashboard" });
  const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AccountWithRelations | null>(null);
  const [detailAccount, setDetailAccount] = useState<AccountWithRelations | null>(null);
  const [pendingDelete, setPendingDelete] = useState<AccountWithRelations | null>(null);
  const [platformManagerOpen, setPlatformManagerOpen] = useState(false);
  const [quickPlatformFormOpen, setQuickPlatformFormOpen] = useState(false);
  const [lastCreatedPlatformId, setLastCreatedPlatformId] = useState<number | null>(null);

  useEffect(() => {
    refreshVault();
  }, [refreshVault]);

  useEffect(() => {
    if (unlocked) settings.load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [unlocked]);

  useAutoLock(unlocked ? settings.autoLockMinutes : 0, () => {
    lock();
    push("Cofre bloqueado por inatividade.", "info");
  });

  const filteredAccounts = useMemo(() => {
    let list = library.accounts;
    if (view.type === "platform") list = list.filter((a) => a.platform_id === view.platformId);
    if (view.type === "favorites") list = list.filter((a) => a.favorite);
    if (search) list = list.filter((a) => matchesSearch(a, search));
    return list;
  }, [library.accounts, view, search]);

  const dashboardAccounts = useMemo(() => {
    return search ? library.accounts.filter((a) => matchesSearch(a, search)) : library.accounts;
  }, [library.accounts, search]);

  async function handleSaveAccount(values: AccountFormValues) {
    let encryptedPassword: string | null = null;
    if (values.password) {
      encryptedPassword = await secretCommands.encrypt(values.password);
    } else if (editingAccount) {
      encryptedPassword = editingAccount.encrypted_password;
    }

    const payload = {
      name: values.name.trim(),
      platform_id: values.platform_id,
      category: values.category.trim() || null,
      username: values.username.trim() || null,
      email: values.email.trim() || null,
      encrypted_password: encryptedPassword,
      login_url: values.login_url.trim() || null,
      website_url: values.website_url.trim() || null,
      notes: values.notes.trim() || null,
      favorite: values.favorite,
      avatar_image_id: values.avatar_image_id,
      tagNames: values.tags,
    };

    if (values.id) {
      await updateAccount(values.id, payload);
      push("Conta atualizada.", "success");
    } else {
      await createAccount(payload);
      push("Conta adicionada.", "success");
    }
    await library.refresh();
  }

  async function handleDeleteAccount() {
    if (!pendingDelete) return;
    await deleteAccount(pendingDelete.id);
    setPendingDelete(null);
    setDetailAccount(null);
    await library.refresh();
    push("Conta excluída.", "success");
  }

  async function handleToggleFavorite(account: AccountWithRelations) {
    await toggleFavorite(account.id, !account.favorite);
    await library.refresh();
  }

  async function handleCreateQuickPlatform(values: PlatformFormValues) {
    const id = await createPlatform(values);
    await library.refresh();
    setLastCreatedPlatformId(id);
  }

  if (vaultStatus === "loading") {
    return <div className="flex h-screen items-center justify-center bg-[var(--color-bg)]" />;
  }
  if (vaultStatus === "uninitialized") {
    return <CreateMasterPassword />;
  }
  if (vaultStatus === "locked") {
    return <UnlockScreen />;
  }

  const viewTitle =
    view.type === "dashboard"
      ? "Meu Cofre"
      : view.type === "favorites"
        ? "Favoritos"
        : view.type === "settings"
          ? "Configurações"
          : library.platforms.find((p) => p.id === view.platformId)?.name ?? "Plataforma";

  return (
    <div className="flex h-screen overflow-hidden bg-[var(--color-bg)] text-[var(--color-text)]">
      <Sidebar
        view={view}
        onNavigate={setView}
        platforms={library.platforms}
        countsByPlatform={library.countsByPlatform}
        favoritesCount={library.favoritesCount}
        onLock={() => lock()}
      />

      <div className="flex flex-1 flex-col overflow-hidden">
        {view.type !== "settings" && (
          <TopBar
            title={viewTitle}
            search={search}
            onSearchChange={setSearch}
            onAddAccount={() => {
              setEditingAccount(null);
              setFormOpen(true);
            }}
            viewMode={settings.viewMode}
            onViewModeChange={settings.setViewMode}
          />
        )}

        <div className="flex-1 overflow-y-auto">
          {view.type === "settings" && (
            <SettingsView platforms={library.platforms} countsByPlatform={library.countsByPlatform} onPlatformsChanged={library.refresh} />
          )}

          {view.type === "dashboard" && (
            <div className="space-y-6 p-6">
              <div>
                <p className="mb-3 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Categorias</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                  {library.platforms.map((platform) => (
                    <CategoryCard
                      key={platform.id}
                      icon={platform.icon}
                      name={platform.name}
                      count={library.countsByPlatform[platform.id] ?? 0}
                      onClick={() => setView({ type: "platform", platformId: platform.id })}
                    />
                  ))}
                  <button
                    onClick={() => setPlatformManagerOpen(true)}
                    className="flex items-center justify-center rounded-xl border border-dashed border-[var(--color-border)] px-4 py-3.5 text-sm text-[var(--color-text-muted)] hover:bg-[var(--color-surface-hover)]"
                  >
                    Gerenciar plataformas
                  </button>
                </div>
              </div>

              <div>
                <p className="mb-3 text-xs font-medium uppercase tracking-wide text-[var(--color-text-muted)]">Todas as contas</p>
                <AccountsBoard
                  accounts={dashboardAccounts}
                  viewMode={settings.viewMode}
                  onOpenDetail={setDetailAccount}
                  onEdit={(a) => {
                    setEditingAccount(a);
                    setFormOpen(true);
                  }}
                  onToggleFavorite={handleToggleFavorite}
                  emptyTitle="Seu cofre está vazio"
                  emptyDescription="Adicione sua primeira conta para começar."
                  onAddAccount={() => {
                    setEditingAccount(null);
                    setFormOpen(true);
                  }}
                />
              </div>
            </div>
          )}

          {(view.type === "platform" || view.type === "favorites") && (
            <div className="p-6">
              <AccountsBoard
                accounts={filteredAccounts}
                viewMode={settings.viewMode}
                onOpenDetail={setDetailAccount}
                onEdit={(a) => {
                  setEditingAccount(a);
                  setFormOpen(true);
                }}
                onToggleFavorite={handleToggleFavorite}
                emptyTitle={view.type === "favorites" ? "Nenhuma conta favoritada" : "Nenhuma conta cadastrada aqui"}
                emptyDescription={
                  view.type === "favorites"
                    ? "Marque contas com a estrela para encontrá-las rapidamente."
                    : "Adicione uma conta desta plataforma para começar."
                }
                onAddAccount={() => {
                  setEditingAccount(null);
                  setFormOpen(true);
                }}
              />
            </div>
          )}
        </div>
      </div>

      <AccountForm
        open={formOpen}
        onClose={() => setFormOpen(false)}
        onSubmit={handleSaveAccount}
        platforms={library.platforms}
        editingAccount={editingAccount}
        defaultPlatformId={view.type === "platform" ? view.platformId : null}
        onRequestNewPlatform={() => setQuickPlatformFormOpen(true)}
        newlyCreatedPlatformId={lastCreatedPlatformId}
        onNewPlatformConsumed={() => setLastCreatedPlatformId(null)}
      />

      <AccountDetailModal
        account={detailAccount}
        onClose={() => setDetailAccount(null)}
        onEdit={() => {
          setEditingAccount(detailAccount);
          setDetailAccount(null);
          setFormOpen(true);
        }}
        onDelete={() => setPendingDelete(detailAccount)}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        title="Excluir conta"
        message={`Tem certeza que deseja excluir "${pendingDelete?.name}"? Essa ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        danger
        onConfirm={handleDeleteAccount}
        onCancel={() => setPendingDelete(null)}
      />

      <PlatformManagerModal
        open={platformManagerOpen}
        onClose={() => setPlatformManagerOpen(false)}
        platforms={library.platforms}
        countsByPlatform={library.countsByPlatform}
        onChanged={library.refresh}
      />

      <PlatformForm
        open={quickPlatformFormOpen}
        onClose={() => setQuickPlatformFormOpen(false)}
        onSubmit={handleCreateQuickPlatform}
        editingPlatform={null}
      />

      <ToastContainer />
    </div>
  );
}

export default App;

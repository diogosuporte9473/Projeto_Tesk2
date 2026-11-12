import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Building2, Edit2, Loader2, Plus, Shield, ShieldCheck, Trash2, UserCheck } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const PASSWORD_MIN = 10;

type Role = "user" | "admin";

const ROLE_LABEL: Record<string, string> = {
  user: "Usuário comum",
  admin: "Administrador",
  master_admin: "Super administrador",
};

const fieldClass =
  "h-10 w-full rounded-lg border border-input bg-transparent px-3 text-sm outline-none focus:border-ring focus:ring-2 focus:ring-ring/30 disabled:opacity-60";

/**
 * Cadastro de usuários com segregação por empresa:
 * - super administrador: cria em qualquer empresa e escolhe a empresa;
 * - administrador: cria apenas na própria empresa;
 * - ambos escolhem entre "usuário comum" e "administrador".
 * As regras valem no servidor; a tela só reflete o que ele permite.
 */
export default function UserManagement() {
  const { user: me } = useAuth();
  const isMaster = me?.role === "master_admin";
  const utils = trpc.useUtils();

  const { data: users, isLoading } = trpc.admin.users.list.useQuery();
  const { data: tenants } = trpc.branding.listAllTenants.useQuery(undefined, { enabled: isMaster, retry: false } as any);
  const createUser = trpc.admin.users.create.useMutation();
  const updateUser = trpc.admin.users.update.useMutation();
  const deleteUser = trpc.admin.users.delete.useMutation();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [username, setUsername] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Role>("user");
  const [tenantId, setTenantId] = useState("");
  const [tenantFilter, setTenantFilter] = useState("");

  const visibleUsers = useMemo(
    () => ((users as any[]) || []).filter((u) => !tenantFilter || u.tenantId === tenantFilter),
    [users, tenantFilter]
  );

  const openCreate = () => {
    setEditing(null);
    setUsername("");
    setName("");
    setPassword("");
    setRole("user");
    setTenantId(tenantFilter);
    setOpen(true);
  };

  const openEdit = (u: any) => {
    setEditing(u);
    setUsername(u.username);
    setName(u.name || "");
    setPassword("");
    setRole(u.role === "admin" ? "admin" : "user");
    setTenantId(u.tenantId || "");
    setOpen(true);
  };

  const editingSelf = !!editing && editing.id === me?.id;
  const editingMaster = editing?.role === "master_admin";
  const roleLocked = editingSelf || editingMaster;
  const passwordTooShort = password.length > 0 && password.length < PASSWORD_MIN;
  const pending = createUser.isPending || updateUser.isPending;
  const canSubmit =
    !pending &&
    !passwordTooShort &&
    (editing ? true : username.trim().length >= 3 && password.length >= PASSWORD_MIN && (!isMaster || !!tenantId));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    try {
      if (editing) {
        await updateUser.mutateAsync({
          id: editing.id,
          name: name.trim() || undefined,
          role: roleLocked ? undefined : role,
          password: password || undefined,
        });
        toast.success("Usuário atualizado");
      } else {
        await createUser.mutateAsync({
          username: username.trim(),
          password,
          name: name.trim() || undefined,
          role,
          ...(isMaster ? { tenantId } : {}),
        });
        toast.success("Usuário criado");
      }
      setOpen(false);
      setPassword("");
      utils.admin.users.list.invalidate();
    } catch (error: any) {
      toast.error(error?.message || "Erro ao salvar usuário");
    }
  };

  const handleDelete = async (u: any) => {
    if (!confirm(`Remover o usuário ${u.username}? O acesso dele é encerrado e isso não pode ser desfeito.`)) return;
    try {
      await deleteUser.mutateAsync({ id: u.id });
      toast.success("Usuário removido");
      utils.admin.users.list.invalidate();
    } catch (error: any) {
      toast.error(error?.message || "Erro ao remover usuário");
    }
  };

  if (isLoading) {
    return (
      <Card className="flex items-center justify-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-semibold text-foreground">Usuários</h3>
          <p className="text-sm text-muted-foreground">
            {isMaster
              ? "Você cadastra usuários em qualquer empresa."
              : "Você cadastra usuários apenas na sua empresa."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {isMaster && (
            <select
              aria-label="Filtrar por empresa"
              value={tenantFilter}
              onChange={(e) => setTenantFilter(e.target.value)}
              className={`${fieldClass} w-full sm:w-48`}
            >
              <option value="">Todas as empresas</option>
              {((tenants as any[]) || []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          )}
          <Button onClick={openCreate} className="flex items-center gap-2">
            <Plus className="h-4 w-4" /> Novo usuário
          </Button>
        </div>
      </div>

      <Card className="overflow-hidden border border-border p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-muted text-xs font-semibold uppercase text-muted-foreground">
              <tr>
                <th className="px-4 py-3">Nome</th>
                <th className="hidden px-4 py-3 sm:table-cell">Login</th>
                {isMaster && <th className="hidden px-4 py-3 md:table-cell">Empresa</th>}
                <th className="hidden px-4 py-3 sm:table-cell">Papel</th>
                <th className="hidden px-4 py-3 lg:table-cell">Criado em</th>
                <th className="px-4 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {visibleUsers.map((u) => {
                const isSelf = u.id === me?.id;
                const canManage = u.role !== "master_admin" || isMaster;
                const RoleIcon = u.role === "master_admin" ? ShieldCheck : u.role === "admin" ? Shield : UserCheck;
                const created = u.createdAt ? new Date(u.createdAt) : null;
                return (
                  <tr key={u.id} className="transition-colors hover:bg-muted/50">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {u.name || "Sem nome"}
                      {isSelf && <span className="ml-2 text-xs font-normal text-muted-foreground">(você)</span>}
                      <span className="block break-all text-xs font-normal text-muted-foreground sm:hidden">{u.username}</span>
                      {isMaster && (
                        <span className="block text-xs font-normal text-muted-foreground md:hidden">
                          {u.tenantName || "Sem empresa válida"}
                        </span>
                      )}
                      <span className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-border px-2 py-0.5 text-xs font-medium sm:hidden">
                        <RoleIcon className="h-3 w-3" /> {ROLE_LABEL[u.role] || u.role}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground sm:table-cell">{u.username}</td>
                    {isMaster && (
                      <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">
                        {u.tenantName ? (
                          <span className="inline-flex items-center gap-1.5">
                            <Building2 className="h-3.5 w-3.5" /> {u.tenantName}
                          </span>
                        ) : (
                          <span className="text-xs italic">Sem empresa válida</span>
                        )}
                      </td>
                    )}
                    <td className="hidden px-4 py-3 sm:table-cell">
                      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-border px-2.5 py-0.5 text-xs font-medium text-foreground">
                        <RoleIcon className="h-3 w-3" /> {ROLE_LABEL[u.role] || u.role}
                      </span>
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">
                      {created && !Number.isNaN(created.getTime()) ? created.toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td className="whitespace-nowrap px-2 py-3 text-right align-top sm:px-4 sm:align-middle">
                      {canManage && (
                        <Button variant="ghost" size="sm" aria-label={`Editar ${u.username}`} onClick={() => openEdit(u)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                      )}
                      {canManage && !isSelf && (
                        <Button
                          variant="ghost"
                          size="sm"
                          aria-label={`Remover ${u.username}`}
                          onClick={() => handleDelete(u)}
                          className="hover:bg-destructive/10 hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {visibleUsers.length === 0 && (
                <tr>
                  <td colSpan={isMaster ? 6 : 5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                    Nenhum usuário encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="border-border bg-background">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar usuário" : "Novo usuário"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "O login e a empresa não mudam depois da criação."
                : isMaster
                  ? "Escolha a empresa e o papel do novo usuário."
                  : "O usuário será criado na sua empresa."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {isMaster && (
              <div className="space-y-1.5">
                <label htmlFor="um-tenant" className="text-sm font-medium">Empresa</label>
                <select
                  id="um-tenant"
                  value={tenantId}
                  onChange={(e) => setTenantId(e.target.value)}
                  disabled={!!editing}
                  required={!editing}
                  className={fieldClass}
                >
                  <option value="">{editing ? "Sem empresa válida" : "Escolha…"}</option>
                  {((tenants as any[]) || []).map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-1.5">
              <label htmlFor="um-username" className="text-sm font-medium">Login (e-mail)</label>
              <input
                id="um-username"
                type="text"
                required
                minLength={3}
                autoComplete="off"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                disabled={!!editing}
                className={fieldClass}
                placeholder="nome@empresa.com"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="um-name" className="text-sm font-medium">Nome completo</label>
              <input
                id="um-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={fieldClass}
                placeholder="Nome do usuário"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="um-password" className="text-sm font-medium">
                {editing ? "Nova senha (deixe em branco para manter)" : "Senha inicial"}
              </label>
              <input
                id="um-password"
                type="password"
                required={!editing}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={fieldClass}
                aria-describedby="um-password-hint"
              />
              <p id="um-password-hint" className={`text-xs ${passwordTooShort ? "text-destructive" : "text-muted-foreground"}`}>
                Mínimo de {PASSWORD_MIN} caracteres e sem conter o login. Uma frase longa é melhor que símbolos.
              </p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="um-role" className="text-sm font-medium">Papel</label>
              {editingMaster ? (
                <p className="text-sm text-muted-foreground">Super administrador (não é alterado por esta tela).</p>
              ) : (
                <>
                  <select
                    id="um-role"
                    value={role}
                    onChange={(e) => setRole(e.target.value as Role)}
                    disabled={roleLocked}
                    className={fieldClass}
                  >
                    <option value="user">Usuário comum</option>
                    <option value="admin">Administrador da empresa</option>
                  </select>
                  <p className="text-xs text-muted-foreground">
                    {editingSelf
                      ? "Ninguém altera o próprio papel; peça a outro administrador."
                      : role === "admin"
                        ? "Gerencia usuários, quadros e auditoria apenas desta empresa."
                        : "Acessa apenas os quadros da empresa a que tiver acesso."}
                  </p>
                </>
              )}
            </div>
            <DialogFooter className="pt-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={!canSubmit}>
                {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

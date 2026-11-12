import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import TrelloDashboardLayout from "@/components/TrelloDashboardLayout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Loader2, User, Bell, Users, Plus, Trash2, Edit2, Shield, UserCheck } from "lucide-react";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useLanguage, type AppLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useBranding } from "@/contexts/BrandingContext";
import UserManagement from "@/components/UserManagement";
import { supabase } from "@/lib/supabase";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";

export default function Settings() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("profile");
  const { language } = useLanguage();
  const isEnglish = language === "en";

  if (!user) {
    return (
      <TrelloDashboardLayout>
        <div className="flex items-center justify-center h-full">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </TrelloDashboardLayout>
    );
  }

  const isAdmin = user.role === "admin" || user.role === "master_admin";

  return (
    <TrelloDashboardLayout>
      <div className="p-4 sm:p-8 max-w-4xl mx-auto">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-foreground mb-2">
            {isEnglish ? "Settings" : "Configurações"}
          </h1>
          <p className="text-muted-foreground">
            {isEnglish ? "Manage your profile and preferences" : "Gerencie seu perfil e preferências"}
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className={`grid w-full grid-cols-2 ${isAdmin ? 'sm:grid-cols-4' : ''} mb-6 sm:mb-8 h-auto gap-1`}>
            <TabsTrigger value="profile" className="flex items-center gap-2 py-3">
              <User className="w-4 h-4" />
              {isEnglish ? "Profile" : "Perfil"}
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center gap-2 py-3">
              <Bell className="w-4 h-4" />
              {isEnglish ? "Notifications" : "Notificações"}
            </TabsTrigger>
            {isAdmin && (
              <>
                <TabsTrigger value="branding" className="flex items-center gap-2 py-3">
                  <Shield className="w-4 h-4" />
                  {isEnglish ? "Branding" : "Personalização"}
                </TabsTrigger>
                <TabsTrigger value="users" className="flex items-center gap-2 py-3">
                  <Users className="w-4 h-4" />
                  {isEnglish ? "Users" : "Usuários"}
                </TabsTrigger>
              </>
            )}
          </TabsList>

          <TabsContent value="profile">
            <ProfileSettings user={user} />
          </TabsContent>

          <TabsContent value="notifications">
            <NotificationSettings />
          </TabsContent>

          {isAdmin && (
            <>
              <TabsContent value="branding">
                <BrandingSettings />
              </TabsContent>
              <TabsContent value="users">
                <UserManagement />
              </TabsContent>
            </>
          )}
        </Tabs>
      </div>
    </TrelloDashboardLayout>
  );
}

function BrandingSettings() {
  const { appName, appLogo, setAppName, setAppLogo } = useBranding();
  const { language } = useLanguage();
  const isEnglish = language === "en";
  const utils = trpc.useUtils();
  const updateBrandingMutation = trpc.branding.update.useMutation();

  const [localName, setLocalName] = useState(appName);
  const [localLogo, setLocalLogo] = useState(appLogo);
  const [isUploading, setIsUploading] = useState(false);

  const handleSave = async () => {
    try {
      await updateBrandingMutation.mutateAsync({
        appName: localName,
        appLogoUrl: localLogo,
      });
      setAppName(localName);
      setAppLogo(localLogo);
      utils.branding.get.invalidate();
      toast.success(isEnglish ? "Branding updated successfully!" : "Personalização atualizada com sucesso!");
    } catch (error: any) {
      toast.error(isEnglish ? "Error updating branding" : "Erro ao atualizar personalização");
    }
  };

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const toastId = toast.loading(isEnglish ? "Uploading logo..." : "Fazendo upload do logo...");

    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `logo-${Date.now()}.${fileExt}`;
      const filePath = fileName; // Removido o prefixo 'branding/' pois já estamos no bucket branding

      const { data, error: uploadError } = await supabase.storage
        .from('branding')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('branding')
        .getPublicUrl(filePath);

      setLocalLogo(publicUrl);
      toast.success(isEnglish ? "Logo uploaded!" : "Logo carregado!", { id: toastId });
    } catch (error: any) {
      console.error("Upload error:", error);
      toast.error(isEnglish ? "Error uploading logo" : "Erro ao carregar logo", { id: toastId });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <Card className="p-6 border border-border">
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-4">
            {isEnglish ? "Branding and Customization" : "Aparência e Marca"}
          </h3>
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                {isEnglish ? "Application Name" : "Nome da Aplicação"}
              </label>
              <input
                type="text"
                value={localName}
                onChange={(e) => setLocalName(e.target.value)}
                placeholder="DStasks"
                className="w-full px-4 py-2 rounded-lg border border-border bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              />
              <p className="text-xs text-muted-foreground mt-2">
                {isEnglish ? "This name will appear in the header and title of the application." : "Este nome aparecerá no cabeçalho e título da aplicação."}
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                {isEnglish ? "Application Logo" : "Logo da Aplicação"}
              </label>
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4">
                <div className="w-20 h-20 bg-muted rounded-lg flex items-center justify-center overflow-hidden border border-border">
                  {localLogo ? (
                    <img src={localLogo} alt="Preview" className="w-full h-full object-contain" />
                  ) : (
                    <span className="text-2xl font-bold text-muted-foreground">M</span>
                  )}
                </div>
                <div className="flex flex-col gap-2">
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml"
                    onChange={handleLogoUpload}
                    className="hidden"
                    id="logo-upload"
                  />
                  <label
                    htmlFor="logo-upload"
                    className="cursor-pointer px-4 py-2 bg-accent text-accent-foreground rounded-lg text-sm font-medium hover:bg-accent/90 transition-colors text-center"
                  >
                    {isEnglish ? "Upload Logo" : "Upload de Logo"}
                  </label>
                  {localLogo && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setLocalLogo(null)}
                      className="text-red-500 hover:text-red-600 hover:bg-red-50"
                    >
                      {isEnglish ? "Remove Logo" : "Remover Logo"}
                    </Button>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                {isEnglish ? "Supported formats: PNG, JPG, SVG. Recommended height: 40px." : "Formatos suportados: PNG, JPG, SVG. Altura recomendada: 40px."}
              </p>
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-4 border-t border-border">
          <Button
            onClick={handleSave}
            className="bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {isEnglish ? "Save Changes" : "Salvar Alterações"}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function ProfileSettings({ user }: { user: any }) {
  const [name, setName] = useState(user.name || "");
  const utils = trpc.useUtils();
  const updateProfileMutation = trpc.settings.updateProfile.useMutation();
  const { language, setLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();
  const isEnglish = language === "en";

  const getSafeMemberSince = () => {
    const rawDate = user.createdAt ?? user.created_at;
    if (!rawDate) return "-";

    const parsed = new Date(rawDate);
    if (Number.isNaN(parsed.getTime())) return "-";

    return parsed.toLocaleDateString(language === "en" ? "en-US" : "pt-BR");
  };

  const handleUpdateProfile = async () => {
    if (!name.trim()) {
      toast.error("Nome é obrigatório");
      return;
    }

    try {
      await updateProfileMutation.mutateAsync({
        name: name.trim(),
      });
      await utils.auth.me.invalidate();
      toast.success(isEnglish ? "Profile updated successfully!" : "Perfil atualizado com sucesso!");
    } catch (error) {
      toast.error(isEnglish ? "Error updating profile" : "Erro ao atualizar perfil");
      console.error(error);
    }
  };

  return (
    <Card className="p-6 border border-border">
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-4">
            {isEnglish ? "Personal Information" : "Informações Pessoais"}
          </h3>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                {isEnglish ? "Full Name" : "Nome Completo"}
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={isEnglish ? "Your name" : "Seu nome"}
                className="w-full px-4 py-2 rounded-lg border border-border bg-background text-foreground placeholder-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                {isEnglish ? "Login Method" : "Método de Login"}
              </label>
              <div className="px-4 py-2 rounded-lg bg-muted border border-border text-foreground capitalize">
                {user.loginMethod || (isEnglish ? "Not specified" : "Não especificado")}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                {isEnglish ? "Role" : "Função"}
              </label>
              <div className="px-4 py-2 rounded-lg bg-muted border border-border text-foreground capitalize">
                {user.role === "admin" ? (isEnglish ? "Administrator" : "Administrador") : (isEnglish ? "User" : "Usuário")}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                {isEnglish ? "Member since" : "Membro desde"}
              </label>
              <div className="px-4 py-2 rounded-lg bg-muted border border-border text-foreground">
                {getSafeMemberSince()}
              </div>
            </div>

            <div>
              <label className="block text-sm font-medium text-foreground mb-2">
                {isEnglish ? "Language" : "Idioma"}
              </label>
              <Select value={language} onValueChange={(value) => setLanguage(value as AppLanguage)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={isEnglish ? "Select language" : "Selecione o idioma"} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pt-BR">Português (Brasil)</SelectItem>
                  <SelectItem value="en">English</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground mt-2">
                {isEnglish
                  ? "Applied globally and saved for your next sessions."
                  : "Aplicado globalmente e salvo para suas próximas sessões."}
              </p>
            </div>

            {setTheme && (
              <div>
                <label className="block text-sm font-medium text-foreground mb-2">
                  {isEnglish ? "Appearance" : "Aparência"}
                </label>
                <Select
                  value={theme}
                  onValueChange={(value) =>
                    setTheme(value === "dark" ? "dark" : "light")
                  }
                >
                  <SelectTrigger className="w-full">
                    <SelectValue
                      placeholder={isEnglish ? "Select theme" : "Selecione o tema"}
                    />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="light">
                      {isEnglish ? "Light (default)" : "Claro (padrão)"}
                    </SelectItem>
                    <SelectItem value="dark">
                      {isEnglish ? "Dark (comfortable contrast)" : "Escuro (contraste confortável)"}
                    </SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground mt-2">
                  {isEnglish
                    ? "Dark mode uses soft neutrals with your brand purple and lime accents — easy on the eyes for long sessions."
                    : "O modo escuro usa azul-marinho com o ciano da marca — confortável para uso prolongado."}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex gap-3 pt-4 border-t border-border">
          <Button
            onClick={handleUpdateProfile}
            disabled={updateProfileMutation.isPending}
            className="bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {updateProfileMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {isEnglish ? "Saving..." : "Salvando..."}
              </>
            ) : (
              isEnglish ? "Save Changes" : "Salvar Alterações"
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}

function NotificationSettings() {
  const { data: preferences, isLoading } = trpc.settings.getPreferences.useQuery(undefined);
  const updatePrefsMutation = trpc.settings.updatePreferences.useMutation();
  const { language } = useLanguage();
  const isEnglish = language === "en";

  const [emailOnCardAssigned, setEmailOnCardAssigned] = useState(true);
  const [emailOnCardUpdated, setEmailOnCardUpdated] = useState(true);
  const [emailOnMirroredCard, setEmailOnMirroredCard] = useState(true);
  const [emailOnDueDate, setEmailOnDueDate] = useState(true);

  useEffect(() => {
    if (preferences) {
      setEmailOnCardAssigned(preferences.emailOnCardAssigned);
      setEmailOnCardUpdated(preferences.emailOnCardUpdated);
      setEmailOnMirroredCard(preferences.emailOnMirroredCard);
      setEmailOnDueDate(preferences.emailOnDueDate);
    }
  }, [preferences]);

  const handleUpdatePreferences = async () => {
    try {
      await updatePrefsMutation.mutateAsync({
        emailOnCardAssigned,
        emailOnCardUpdated,
        emailOnMirroredCard,
        emailOnDueDate,
      });
      toast.success(
        isEnglish ? "Preferences updated successfully!" : "Preferências atualizadas com sucesso!"
      );
    } catch (error) {
      toast.error(isEnglish ? "Error updating preferences" : "Erro ao atualizar preferências");
      console.error(error);
    }
  };

  if (isLoading) {
    return (
      <Card className="p-6 border border-border flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
      </Card>
    );
  }

  return (
    <Card className="p-6 border border-border">
      <div className="space-y-6">
        <div>
          <h3 className="text-lg font-semibold text-foreground mb-4">
            {isEnglish ? "Notification Preferences" : "Preferências de Notificações"}
          </h3>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-4 rounded-lg bg-muted border border-border">
              <div>
                <p className="font-medium text-foreground">
                  {isEnglish ? "Assigned Card" : "Cartão Atribuído"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {isEnglish
                    ? "Receive an email when a card is assigned to you"
                    : "Receba email quando um cartão for atribuído a você"}
                </p>
              </div>
              <Switch
                checked={emailOnCardAssigned}
                onCheckedChange={setEmailOnCardAssigned}
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg bg-muted border border-border">
              <div>
                <p className="font-medium text-foreground">
                  {isEnglish ? "Card Updated" : "Cartão Atualizado"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {isEnglish ? "Receive an email when a card is updated" : "Receba email quando um cartão for atualizado"}
                </p>
              </div>
              <Switch
                checked={emailOnCardUpdated}
                onCheckedChange={setEmailOnCardUpdated}
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg bg-muted border border-border">
              <div>
                <p className="font-medium text-foreground">
                  {isEnglish ? "Mirrored Card" : "Cartão Espelhado"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {isEnglish ? "Receive an email when a card is mirrored" : "Receba email quando um cartão for espelhado"}
                </p>
              </div>
              <Switch
                checked={emailOnMirroredCard}
                onCheckedChange={setEmailOnMirroredCard}
              />
            </div>

            <div className="flex items-center justify-between p-4 rounded-lg bg-muted border border-border">
              <div>
                <p className="font-medium text-foreground">
                  {isEnglish ? "Due Date" : "Data de Vencimento"}
                </p>
                <p className="text-sm text-muted-foreground">
                  {isEnglish ? "Receive an alert when the due date is close" : "Receba alerta quando a data de vencimento estiver próxima"}
                </p>
              </div>
              <Switch
                checked={emailOnDueDate}
                onCheckedChange={setEmailOnDueDate}
              />
            </div>
          </div>
        </div>

        <div className="flex gap-3 pt-4 border-t border-border">
          <Button
            onClick={handleUpdatePreferences}
            disabled={updatePrefsMutation.isPending}
            className="bg-accent text-accent-foreground hover:bg-accent/90"
          >
            {updatePrefsMutation.isPending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                {isEnglish ? "Saving..." : "Salvando..."}
              </>
            ) : (
              isEnglish ? "Save Preferences" : "Salvar Preferências"
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
}

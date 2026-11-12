import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Bell } from "lucide-react";
import { useLocation } from "wouter";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { trpc } from "@/lib/trpc";
import { cn } from "@/lib/utils";

/** Sino de notificações (avisos gerados pelas automações dos quadros). */
export default function NotificationBell({ compact }: { compact?: boolean }) {
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();
  const { data } = trpc.notifications.list.useQuery(undefined, { refetchInterval: 60000, refetchOnWindowFocus: true } as any);
  const markAllRead = trpc.notifications.markAllRead.useMutation({ onSuccess: () => utils.notifications.list.invalidate() });

  const unread = data?.unread || 0;
  const items = data?.items || [];

  return (
    <Popover onOpenChange={(open) => !open && unread > 0 && markAllRead.mutate()}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn("nav-item relative w-full", compact && "justify-center px-0")}
          aria-label={unread > 0 ? `Notificações: ${unread} não lida(s)` : "Notificações"}
        >
          <span className="relative flex-shrink-0">
            <Bell className="h-4 w-4" />
            {unread > 0 && <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-red-500 ring-2 ring-sidebar" />}
          </span>
          {!compact && <span className="flex-1 truncate text-left">Notificações</span>}
          {!compact && unread > 0 && (
            <span className="rounded-full bg-red-500 px-1.5 text-[10px] font-bold leading-4 text-white">{unread > 9 ? "9+" : unread}</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-80 p-0">
        <div className="border-b border-border px-3 py-2.5 text-sm font-semibold">Notificações</div>
        <div className="thin-scroll max-h-96 overflow-y-auto">
          {items.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">Nenhuma notificação.</p>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => item.boardId && setLocation(`/board/${item.boardId}`)}
                className="flex w-full gap-2 border-b border-border px-3 py-2.5 text-left last:border-b-0 hover:bg-foreground/[0.04]"
              >
                <span className={cn("mt-1.5 h-2 w-2 flex-shrink-0 rounded-full", item.read ? "bg-transparent" : "bg-primary")} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13px] font-medium">{item.title}</span>
                  {item.message && <span className="block text-[13px] leading-snug text-muted-foreground">{item.message}</span>}
                  <span className="mt-0.5 block text-[11px] text-muted-foreground">
                    {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true, locale: ptBR })}
                  </span>
                </span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

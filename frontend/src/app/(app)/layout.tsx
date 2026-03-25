import { AppShell } from "@/components/app-shell";
import { FinanceStoreProvider } from "@/lib/finance-store";

export default function AuthenticatedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <FinanceStoreProvider>
      <AppShell>{children}</AppShell>
    </FinanceStoreProvider>
  );
}

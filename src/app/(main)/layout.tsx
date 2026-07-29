import { Sidebar } from "@/components/dashboard/Sidebar";
import { Topbar } from "@/components/dashboard/Topbar";

export default function MainLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <div className="h-screen bg-background text-foreground flex overflow-hidden">

            {/* Background Seamless Dotted Pattern */}
            <div
                className="fixed inset-0 z-0 opacity-[0.08] dark:opacity-20 pointer-events-none"
                style={{
                    backgroundImage: `radial-gradient(circle at 1px 1px, currentColor 1px, transparent 0)`,
                    backgroundSize: "32px 32px"
                }}
            />

            {/* Desktop Sidebar (Collapsible) */}
            <Sidebar />

            {/* Main Content Area */}
            <div className="flex-1 flex flex-col overflow-hidden relative z-10">
                <Topbar />

                <main className="flex-1 overflow-y-auto p-4 md:p-8 lg:p-10 scroll-smooth">
                    {children}
                </main>
            </div>
        </div>
    );
}

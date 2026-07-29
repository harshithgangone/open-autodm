"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { AutomationsList } from "@/components/automations/AutomationsList";
import { ContactsList } from "@/components/automations/ContactsList";
import { NewAutomationModal } from "@/components/automations/new-flow/NewAutomationModal";
import { useAutomations, useToggleAutomation, useDeleteAutomation } from "@/hooks/useAutomations";
import type { AutomationFromDB } from "@/hooks/useAutomations";
import { AutomationDebugPanel } from "@/components/debug/AutomationDebugPanel";

export default function AutomationsPage() {
    const [activeTab, setActiveTab] = useState<"automations" | "contacts">("automations");
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingAutomation, setEditingAutomation] = useState<AutomationFromDB | null>(null);

    const { data: automations, isLoading } = useAutomations();
    const toggleMutation = useToggleAutomation();
    const deleteMutation = useDeleteAutomation();

    const handleToggle = (id: string, currentlyActive: boolean) => {
        toggleMutation.mutate({ id, isActive: !currentlyActive });
    };

    const handleDelete = (id: string) => {
        deleteMutation.mutate(id);
    };

    const handleEdit = (automation: AutomationFromDB) => {
        setEditingAutomation(automation);
        setIsModalOpen(true);
    };

    const handleModalClose = () => {
        setIsModalOpen(false);
        setEditingAutomation(null);
    };

    return (
        <div className="w-full max-w-7xl mx-auto space-y-8 pb-12">

            {/* Header row: Tabs & New Button */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-4">
                <div className="flex bg-muted/30 p-1 rounded-xl border border-border/50">
                    <button
                        onClick={() => setActiveTab("automations")}
                        className={cn(
                            "px-6 py-2 rounded-lg text-sm font-bold transition-all duration-300",
                            activeTab === "automations"
                                ? "bg-card text-foreground shadow-sm ring-1 ring-border/50"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                        )}
                    >
                        Automations
                    </button>
                    <button
                        onClick={() => setActiveTab("contacts")}
                        className={cn(
                            "px-6 py-2 rounded-lg text-sm font-bold transition-all duration-300",
                            activeTab === "contacts"
                                ? "bg-card text-foreground shadow-sm ring-1 ring-border/50"
                                : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                        )}
                    >
                        Contacts
                    </button>
                </div>

                <button
                    onClick={() => { setEditingAutomation(null); setIsModalOpen(true); }}
                    className="inline-flex items-center justify-center space-x-2 bg-[#F97316] text-white hover:bg-[#ea580c] px-5 py-2.5 rounded-xl font-bold shadow-lg shadow-[#F97316]/20 transition-transform active:scale-95"
                >
                    <Plus className="w-4 h-4" />
                    <span>New Automation</span>
                </button>
            </div>

            {/* Active Content Area */}
            <div className="min-h-[500px]">
                {activeTab === "automations" ? (
                    <AutomationsList
                        automations={automations ?? []}
                        isLoading={isLoading}
                        onToggle={handleToggle}
                        onDelete={handleDelete}
                        onEdit={handleEdit}
                        deleteError={deleteMutation.error?.message ?? null}
                    />
                ) : (
                    <ContactsList />
                )}
            </div>

            {/* Modal (create + edit) */}
            <NewAutomationModal
                isOpen={isModalOpen}
                onClose={handleModalClose}
                editAutomation={editingAutomation}
            />

            {/* Debug panel — only visible when NEXT_PUBLIC_DEBUG=true */}
            <AutomationDebugPanel />

        </div>
    );
}

"use client";

import { motion } from "framer-motion";
import { Search, Filter, ArrowUpDown, MoreHorizontal, User } from "lucide-react";

const MOCK_CONTACTS = [
    { id: "1", name: "Jessica Smith", handle: "@jessicasmith", relation: "Follows You", trigger: "IG Comment Auto-Reply", date: "Oct 24, 2023" },
    { id: "2", name: "Mark Anderson", handle: "@mark_anderson", relation: "Mutual", trigger: "Black Friday Promo", date: "Nov 02, 2023" },
    { id: "3", name: "Sarah Lee", handle: "@sarah_creative", relation: "You Follow", trigger: "Welcome Message Flow", date: "Nov 12, 2023" },
    { id: "4", name: "David Chen", handle: "@david_chen_design", relation: "Follows You", trigger: "IG Comment Auto-Reply", date: "Nov 15, 2023" },
    { id: "5", name: "Emily Davis", handle: "@emily.davis99", relation: "Mutual", trigger: "Black Friday Promo", date: "Nov 21, 2023" },
];

export function ContactsList() {
    return (
        <div className="flex flex-col space-y-4 w-full animate-in fade-in duration-500">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-card/40 backdrop-blur-sm p-4 rounded-2xl border border-border/50">
                <div className="relative w-full sm:max-w-xs">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input 
                        type="text" 
                        placeholder="Search contacts..." 
                        className="w-full bg-background border border-border/50 rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                </div>
                <div className="flex items-center space-x-2 w-full sm:w-auto">
                    <button className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-4 py-2 border border-border/50 rounded-xl bg-background hover:bg-muted/50 transition-colors text-sm font-medium">
                        <Filter className="w-4 h-4" />
                        <span>Filter</span>
                    </button>
                    <button className="flex-1 sm:flex-none flex items-center justify-center space-x-2 px-4 py-2 border border-border/50 rounded-xl bg-background hover:bg-muted/50 transition-colors text-sm font-medium">
                        <ArrowUpDown className="w-4 h-4" />
                        <span>Sort</span>
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="w-full overflow-x-auto bg-card/60 backdrop-blur-sm border border-border/50 rounded-2xl shadow-sm">
                <table className="w-full text-left text-sm whitespace-nowrap">
                    <thead className="bg-muted/30 text-muted-foreground uppercase tracking-widest text-[10px] font-bold border-b border-border/50">
                        <tr>
                            <th className="px-6 py-4">User</th>
                            <th className="px-6 py-4">Relationship</th>
                            <th className="px-6 py-4">Automation Triggered</th>
                            <th className="px-6 py-4">Date Added</th>
                            <th className="px-6 py-4 text-right">Actions</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/30">
                        {MOCK_CONTACTS.map((contact, i) => (
                            <motion.tr 
                                key={contact.id}
                                initial={{ opacity: 0, y: 10 }}
                                animate={{ opacity: 1, y: 0 }}
                                transition={{ delay: i * 0.05 }}
                                className="group hover:bg-muted/30 transition-colors cursor-pointer"
                            >
                                <td className="px-6 py-4">
                                    <div className="flex items-center space-x-3">
                                        <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center shrink-0">
                                            <span className="text-white font-bold text-sm tracking-wider">{contact.name.charAt(0)}</span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="font-bold text-foreground group-hover:text-primary transition-colors">{contact.name}</span>
                                            <span className="text-muted-foreground text-xs">{contact.handle}</span>
                                        </div>
                                    </div>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-[10px] font-bold uppercase tracking-wider border ${
                                        contact.relation === 'Mutual' ? 'bg-green-500/10 text-green-500 border-green-500/20' :
                                        contact.relation === 'Follows You' ? 'bg-blue-500/10 text-blue-500 border-blue-500/20' :
                                        'bg-orange-500/10 text-orange-500 border-orange-500/20'
                                    }`}>
                                        {contact.relation}
                                    </span>
                                </td>
                                <td className="px-6 py-4 font-medium text-foreground/80">{contact.trigger}</td>
                                <td className="px-6 py-4 text-muted-foreground">{contact.date}</td>
                                <td className="px-6 py-4 text-right">
                                    <button className="p-2 text-muted-foreground hover:text-foreground hover:bg-muted rounded-xl transition-colors opacity-0 group-hover:opacity-100 focus:opacity-100">
                                        <MoreHorizontal className="w-4 h-4" />
                                    </button>
                                </td>
                            </motion.tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

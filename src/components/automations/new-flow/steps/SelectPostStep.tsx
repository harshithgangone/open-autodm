import { motion } from "framer-motion";
import { MessageCircle, PlaySquare, Layers, Search, Instagram } from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";
import { useInstagramPosts } from "@/hooks/useInstagramPosts";

interface SelectPostStepProps {
    onSelect: (postId: string, name: string, thumbnailUrl?: string | null, caption?: string) => void;
    selectedPost: string | null;
    flowName: string;
    instagramAccountId?: string | null;
}

export function SelectPostStep({ onSelect, selectedPost, flowName, instagramAccountId }: SelectPostStepProps) {
    const [searchQuery, setSearchQuery] = useState("");
    const [filter, setFilter] = useState<"all" | "reels" | "posts">("all");
    const [localName, setLocalName] = useState(flowName);
    const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useInstagramPosts(instagramAccountId);

    const allPosts = data?.pages.flatMap(p => p.posts) ?? [];

    const filteredPosts = allPosts.filter(post => {
        const matchesSearch = post.caption.toLowerCase().includes(searchQuery.toLowerCase());
        const matchesFilter =
            filter === "all" ||
            (filter === "reels" && post.type === "reel") ||
            (filter === "posts" && post.type !== "reel");
        return matchesSearch && matchesFilter;
    });

    const visiblePosts = filteredPosts;
    const hasMore = hasNextPage && !searchQuery && filter === "all";

    return (
        <div className="flex flex-col w-full h-full">
            {/* ── Sticky top bar ── */}
            <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-xl border-b border-border/40">

                {/* Automation name — highlighted section */}
                <div className="px-6 pt-5 pb-4 bg-primary/5 border-b border-primary/15">
                    <div className="flex flex-col sm:flex-row sm:items-end gap-4 max-w-7xl mx-auto">
                        <div className="flex-1">
                            <label className="text-[11px] font-extrabold text-primary uppercase tracking-widest mb-2 block">
                                Automation Name
                            </label>
                            <input
                                type="text"
                                value={localName}
                                onChange={(e) => setLocalName(e.target.value)}
                                className="w-full bg-background border border-primary/30 rounded-xl px-4 py-2.5 text-sm font-semibold placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/50 transition-all shadow-sm"
                                placeholder="e.g. Lead Gen Campaign, Launch Week Promo…"
                            />
                            <p className="text-[10px] text-primary/60 mt-1.5 font-medium">Give this automation a descriptive internal name so you can recognise it later.</p>
                        </div>
                        <div className="shrink-0 pb-[2px]">
                            <button
                                onClick={() => onSelect("all", localName, null, "")}
                                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-bold bg-background border border-border hover:border-primary/40 hover:bg-primary/5 rounded-xl transition-all shadow-sm whitespace-nowrap"
                            >
                                <Layers className="w-4 h-4 opacity-60" />
                                Trigger on All Posts
                            </button>
                        </div>
                    </div>
                </div>

                {/* Search + Filter tabs */}
                <div className="px-6 py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-1 bg-muted/30 p-0.5 rounded-xl border border-border/50">
                        {(["all", "reels", "posts"] as const).map((f) => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={cn(
                                    "px-4 py-1.5 rounded-[10px] text-xs font-bold capitalize transition-all",
                                    filter === f
                                        ? "bg-card text-foreground shadow-sm ring-1 ring-border/40"
                                        : "text-muted-foreground hover:text-foreground"
                                )}
                            >
                                {f === "all" ? "All Media" : f === "reels" ? "Reels" : "Photos"}
                            </button>
                        ))}
                    </div>

                    <div className="relative w-full sm:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                        <input
                            type="text"
                            placeholder="Search captions…"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-muted/30 border border-border/50 rounded-xl pl-9 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#F97316]/50 transition-all font-medium"
                        />
                    </div>
                </div>
            </div>

            {/* ── Posts grid ── */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar pb-8">
                <div className="max-w-7xl mx-auto">
                    {!instagramAccountId ? (
                        <div className="flex flex-col items-center justify-center p-12 text-center border border-border/50 border-dashed rounded-3xl bg-muted/10">
                            <Instagram className="w-10 h-10 text-muted-foreground/30 mb-4" />
                            <p className="text-muted-foreground font-medium">No Instagram account connected.</p>
                            <p className="text-sm text-muted-foreground/70 mt-1">
                                Go to Settings → Connected Accounts to connect your Instagram.
                            </p>
                        </div>
                    ) : isLoading ? (
                        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
                            {Array.from({ length: 12 }).map((_, i) => (
                                <div key={i} className="aspect-[4/5] rounded-2xl overflow-hidden">
                                    <div className="w-full h-full bg-muted/40 relative overflow-hidden">
                                        <div
                                            className="absolute inset-0 -translate-x-full animate-[shimmer_1.5s_infinite]"
                                            style={{
                                                background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)",
                                            }}
                                        />
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : isError ? (
                        <div className="flex flex-col items-center justify-center p-12 text-center border border-destructive/20 border-dashed rounded-3xl bg-destructive/5">
                            <p className="text-destructive font-medium">Failed to load posts.</p>
                            <p className="text-sm text-muted-foreground mt-1">Check that your Instagram account is still connected.</p>
                        </div>
                    ) : filteredPosts.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-12 text-center border border-border/50 border-dashed rounded-3xl bg-muted/10">
                            <p className="text-muted-foreground font-medium">No posts found.</p>
                        </div>
                    ) : (
                        <>
                            <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 sm:gap-5">
                                {visiblePosts.map((post, idx) => {
                                    const isSelected = selectedPost === post.id;
                                    const thumbUrl = post.thumbnail_url ?? post.media_url;

                                    return (
                                        <motion.div
                                            key={post.id}
                                            initial={{ opacity: 0, y: 20 }}
                                            animate={{ opacity: 1, y: 0 }}
                                            transition={{ delay: Math.min(idx * 0.04, 0.4) }}
                                            onClick={() => onSelect(post.id, localName, thumbUrl ?? null, post.caption ?? "")}
                                            className={cn(
                                                "group relative rounded-2xl overflow-hidden cursor-pointer transition-all duration-300 transform",
                                                isSelected
                                                    ? "ring-4 ring-[#F97316] ring-offset-4 ring-offset-background scale-[1.02] shadow-xl shadow-[#F97316]/20 z-10"
                                                    : "ring-1 ring-border/50 hover:ring-border hover:scale-[1.01] hover:shadow-lg opacity-90 hover:opacity-100"
                                            )}
                                        >
                                            <div className="aspect-[4/5] relative bg-muted w-full overflow-hidden">
                                                {thumbUrl ? (
                                                    <img
                                                        src={thumbUrl}
                                                        alt="Post thumbnail"
                                                        className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                                                    />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center bg-muted">
                                                        <Instagram className="w-8 h-8 text-muted-foreground/30" />
                                                    </div>
                                                )}

                                                <div className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center border border-white/10 shadow-sm">
                                                    {post.type === "reel" ? <PlaySquare className="w-4 h-4 text-white" /> :
                                                     post.type === "carousel" ? <Layers className="w-4 h-4 text-white" /> :
                                                     <span className="w-4 h-4 bg-white rounded-sm opacity-80" />}
                                                </div>

                                                <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-gradient-to-t from-black/90 via-black/40 to-transparent p-4 flex flex-col justify-end">
                                                    <div className="flex items-center justify-between text-white/90 text-sm font-medium">
                                                        <div className="flex items-center font-mono">
                                                            <PlaySquare className="w-4 h-4 mr-1.5 opacity-80" fill="currentColor" />
                                                            {post.like_count.toLocaleString()}
                                                        </div>
                                                        <div className="flex items-center font-mono">
                                                            <MessageCircle className="w-4 h-4 mr-1.5 opacity-80" fill="currentColor" />
                                                            {post.comments_count.toLocaleString()}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className={cn(
                                                "p-4 border-t transition-colors duration-300",
                                                isSelected ? "bg-[#F97316]/10 border-[#F97316]/20" : "bg-card border-border/10"
                                            )}>
                                                <p className="text-sm text-foreground font-medium line-clamp-2 leading-relaxed mb-2">
                                                    {post.caption || <span className="text-muted-foreground italic">No caption</span>}
                                                </p>
                                                <span className="text-[10px] text-muted-foreground uppercase font-bold tracking-widest">
                                                    {new Date(post.timestamp).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                                                </span>
                                            </div>

                                            {isSelected && (
                                                <div className="absolute top-3 left-3 w-8 h-8 bg-[#F97316] rounded-full flex items-center justify-center shadow-lg shadow-[#F97316]/50">
                                                    <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                                                    </svg>
                                                </div>
                                            )}
                                        </motion.div>
                                    );
                                })}
                            </div>

                            {/* Load More — fetches the next page from Instagram API */}
                            {(hasMore || isFetchingNextPage) && (
                                <div className="flex justify-center mt-8">
                                    <button
                                        onClick={() => void fetchNextPage()}
                                        disabled={isFetchingNextPage}
                                        className="inline-flex items-center gap-2 px-6 py-2.5 text-sm font-bold bg-muted/40 hover:bg-muted/70 border border-border/50 rounded-xl transition-all disabled:opacity-60"
                                    >
                                        {isFetchingNextPage ? (
                                            <>
                                                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                                                Loading…
                                            </>
                                        ) : "Load more posts"}
                                    </button>
                                </div>
                            )}
                        </>
                    )}
                </div>
            </div>

            {/* Mobile action bar */}
            {selectedPost && selectedPost !== "all" && (
                <div className="fixed bottom-0 left-0 right-0 p-4 border-t border-border bg-background/80 backdrop-blur-xl md:hidden z-30">
                    <button
                        onClick={() => {
                            const post = allPosts.find(p => p.id === selectedPost);
                            onSelect(selectedPost, localName, post?.thumbnail_url ?? post?.media_url ?? null, post?.caption ?? "");
                        }}
                        className="w-full py-3 bg-[#F97316] text-white rounded-xl font-bold shadow-lg shadow-[#F97316]/20"
                    >
                        Continue with Selected
                    </button>
                </div>
            )}
        </div>
    );
}

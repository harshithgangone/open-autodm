"use client";

import React, { useState } from "react";
import { motion } from "framer-motion";
import {
  MessageCircle,
  Film,
  Send,
  Image as ImageIcon,
  Search,
  Instagram,
  Check,
  AlertCircle,
  Layers,
  Sparkles,
  Calendar,
  PlaySquare,
  Heart,
  ChevronRight,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { AutomationFlowData } from "../NewAutomationModal";
import { useInstagramPosts } from "@/hooks/useInstagramPosts";

interface Step1SetupProps {
  data: AutomationFlowData;
  onUpdate: (patch: Partial<AutomationFlowData>) => void;
  accountId?: string | null;
  validationError?: string | null;
}

export function Step1Setup({
  data,
  onUpdate,
  accountId,
  validationError,
}: Step1SetupProps) {
  const [postMode, setPostMode] = useState<"all" | "specific">(() => {
    return data.postId === "all" || !data.postId ? "all" : "specific";
  });
  const [searchQuery, setSearchQuery] = useState("");
  const [mediaFilter, setMediaFilter] = useState<"all" | "reels" | "posts">("all");
  const [specificReelInput, setSpecificReelInput] = useState(() => {
    return data.postId && data.postId !== "all" ? data.postId : "";
  });

  const { data: postsData, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useInstagramPosts(accountId);

  const allPosts = postsData?.pages.flatMap((p) => p.posts) ?? [];

  const filteredPosts = allPosts.filter((post) => {
    const matchesSearch = (post.caption || "").toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter =
      mediaFilter === "all" ||
      (mediaFilter === "reels" && post.type === "reel") ||
      (mediaFilter === "posts" && post.type !== "reel");
    return matchesSearch && matchesFilter;
  });

  const isComment = !data.type || data.type === "comment-dm" || data.type === "comment_dm";
  const isReel = data.type === "reel-dm" || data.type === "reel_dm";
  const isDm = data.type === "dm-reply" || data.type === "dm_reply";
  const isStory = data.type === "story-reply" || data.type === "story_reply";

  const triggerTypes = [
    {
      id: "comment-dm",
      title: "Comment on a Post or Reel",
      desc: "Auto-DM users who comment on your posts or reels",
      icon: MessageCircle,
      badge: "Most Popular",
    },
    {
      id: "reel-dm",
      title: "Someone sends me a Reel",
      desc: "Auto-reply when a follower shares a Reel into your DMs",
      icon: Film,
      badge: "New",
    },
    {
      id: "dm-reply",
      title: "Direct Message Keyword",
      desc: "Instant automated reply to specific keywords in DM",
      icon: Send,
    },
    {
      id: "story-reply",
      title: "Story Reply",
      desc: "Auto-DM when someone replies to your active Story",
      icon: ImageIcon,
    },
  ];

  const handleSelectPost = (postId: string, thumbnailUrl?: string | null, caption?: string) => {
    onUpdate({
      postId,
      postThumbnailUrl: thumbnailUrl ?? null,
      postCaption: caption ?? "",
    });
  };

  const handlePostModeChange = (mode: "all" | "specific") => {
    setPostMode(mode);
    if (mode === "all") {
      onUpdate({
        postId: "all",
        postThumbnailUrl: null,
        postCaption: "",
      });
    } else {
      if (data.postId === "all" || !data.postId) {
        onUpdate({
          postId: null,
          postThumbnailUrl: null,
          postCaption: "",
        });
      }
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4 sm:p-6 md:p-8 max-w-4xl w-full mx-auto space-y-8" data-testid="step-1-setup">
      {/* Step Header */}
      <div>
        <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
          Step 1: Setup & Target
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Give your automation a recognizable name, select how it triggers, and choose what content it watches.
        </p>
      </div>

      {validationError && (
        <div
          className="p-3.5 rounded-xl bg-destructive/10 border border-destructive/30 flex items-start gap-3 text-destructive text-sm"
          data-testid="step-1-error"
        >
          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
          <p className="font-medium">{validationError}</p>
        </div>
      )}

      {/* ── Section 1: Automation Name ── */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <label
            htmlFor="automation-name-input"
            className="text-xs font-bold uppercase tracking-wider text-muted-foreground"
          >
            Automation Name <span className="text-destructive">*</span>
          </label>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {data.name.length} / 200
          </span>
        </div>
        <input
          id="automation-name-input"
          type="text"
          maxLength={200}
          value={data.name}
          onChange={(e) => onUpdate({ name: e.target.value })}
          placeholder="e.g. VIP Guide Comment Funnel, Summer Reel Giveaway..."
          className="w-full px-4 py-3 rounded-xl bg-card border border-border text-foreground text-base font-medium placeholder:text-muted-foreground/50 focus:outline-none focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all shadow-sm"
          data-testid="input-automation-name"
        />
      </div>

      {/* ── Section 2: Trigger Type ── */}
      <div className="space-y-3">
        <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
          What should trigger this automation?
        </label>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" data-testid="trigger-type-selector">
          {triggerTypes.map((trig) => {
            const Icon = trig.icon;
            const isSelected =
              data.type === trig.id ||
              (trig.id === "comment-dm" && (!data.type || data.type === "comment_dm")) ||
              (trig.id === "reel-dm" && data.type === "reel_dm") ||
              (trig.id === "dm-reply" && data.type === "dm_reply") ||
              (trig.id === "story-reply" && data.type === "story_reply");

            return (
              <button
                key={trig.id}
                type="button"
                onClick={() => {
                  onUpdate({
                    type: trig.id,
                    ...(trig.id === "reel-dm" && (!data.keywords || data.keywords.length === 0)
                      ? { keywordsAnyMode: true }
                      : {}),
                    ...(trig.id === "comment-dm" ? { postId: postMode === "all" ? "all" : data.postId } : {}),
                  });
                }}
                className={cn(
                  "p-4 rounded-xl border text-left transition-all relative flex items-start gap-3.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                  isSelected
                    ? "border-primary bg-primary/5 ring-1 ring-primary/40 shadow-sm"
                    : "border-border bg-card hover:border-foreground/30 hover:bg-muted/40"
                )}
                data-testid={`trigger-card-${trig.id}`}
              >
                <div
                  className={cn(
                    "w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                    isSelected ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                  )}
                >
                  <Icon className="w-5 h-5" />
                </div>
                <div className="flex-1 min-w-0 pr-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-foreground truncate">
                      {trig.title}
                    </span>
                    {trig.badge && (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20 shrink-0">
                        {trig.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2 leading-relaxed">
                    {trig.desc}
                  </p>
                </div>
                {isSelected && (
                  <div className="absolute top-3.5 right-3.5 w-5 h-5 rounded-full bg-primary flex items-center justify-center text-primary-foreground">
                    <Check className="w-3 h-3 stroke-[3]" />
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Section 3: Content Targeting (Adapts by Trigger) ── */}
      <div className="space-y-4 pt-2 border-t border-border/60">
        {/* Comment on Post or Reel */}
        {isComment && (
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Which Post or Reel?
                </label>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Choose whether this automation monitors all content or a specific post.
                </p>
              </div>

              {/* Segmented Toggle */}
              <div className="inline-flex items-center bg-muted/80 p-1 rounded-xl border border-border shrink-0">
                <button
                  type="button"
                  onClick={() => handlePostModeChange("all")}
                  className={cn(
                    "px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all",
                    postMode === "all"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  data-testid="post-mode-all"
                >
                  All Posts & Reels
                </button>
                <button
                  type="button"
                  onClick={() => handlePostModeChange("specific")}
                  className={cn(
                    "px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all",
                    postMode === "specific"
                      ? "bg-card text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground"
                  )}
                  data-testid="post-mode-specific"
                >
                  Specific Post or Reel
                </button>
              </div>
            </div>

            {/* Mode A: All Posts/Reels */}
            {postMode === "all" ? (
              <div className="p-4 rounded-xl bg-card border border-border flex items-start gap-3.5">
                <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Layers className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold text-foreground">
                    Account-wide coverage active
                  </h4>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                    This automation will listen for comments across all current and future posts and reels published on your account.
                  </p>
                </div>
              </div>
            ) : (
              /* Mode B: Specific Post / Media Grid */
              <div className="space-y-4 rounded-xl bg-card/50 border border-border p-4">
                {/* Special "Next Post/Reel" selector */}
                <div className="flex items-center justify-between p-3 rounded-lg bg-card border border-border">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                      <h5 className="text-xs font-semibold text-foreground">
                        Target my Next upcoming Post or Reel
                      </h5>
                      <p className="text-[11px] text-muted-foreground">
                        Automatically bind to the very next post or reel you publish on Instagram.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleSelectPost("next_post", null, "Upcoming post")}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all border",
                      data.postId === "next_post"
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-muted text-foreground border-border hover:bg-muted/80"
                    )}
                    data-testid="btn-select-next-post"
                  >
                    {data.postId === "next_post" ? "Selected ✓" : "Select Next Post"}
                  </button>
                </div>

                {/* Search & Media Filters */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
                  <div className="inline-flex items-center bg-muted rounded-lg p-0.5">
                    {(["all", "reels", "posts"] as const).map((filter) => (
                      <button
                        key={filter}
                        type="button"
                        onClick={() => setMediaFilter(filter)}
                        className={cn(
                          "h-7 px-3 rounded-[7px] text-xs font-medium capitalize transition-colors",
                          mediaFilter === filter
                            ? "bg-card text-foreground shadow-sm"
                            : "text-muted-foreground hover:text-foreground"
                        )}
                      >
                        {filter === "all" ? "All media" : filter === "reels" ? "Reels only" : "Photos only"}
                      </button>
                    ))}
                  </div>

                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                    <input
                      type="text"
                      placeholder="Search captions..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-full h-8 bg-muted/60 border border-border rounded-lg pl-8 pr-3 text-xs outline-none focus:border-primary transition-colors"
                    />
                  </div>
                </div>

                {/* Media Grid */}
                {!accountId ? (
                  <div className="p-8 text-center border border-dashed border-border rounded-xl">
                    <Instagram className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-muted-foreground">
                      No Instagram account connected
                    </p>
                    <p className="text-[11px] text-muted-foreground/70 mt-0.5">
                      Connect your Instagram account in Settings to select from published posts.
                    </p>
                  </div>
                ) : isLoading ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-3">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <div key={i} className="aspect-[4/5] rounded-xl bg-muted/50 animate-pulse" />
                    ))}
                  </div>
                ) : isError ? (
                  <div className="p-6 text-center border border-destructive/20 bg-destructive/5 rounded-xl">
                    <p className="text-xs font-semibold text-destructive">Could not load posts</p>
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      Ensure your Instagram account token is still active.
                    </p>
                  </div>
                ) : filteredPosts.length === 0 ? (
                  <div className="p-6 text-center border border-dashed border-border rounded-xl">
                    <p className="text-xs text-muted-foreground">No matching posts found.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 max-h-[360px] overflow-y-auto pr-1">
                    {filteredPosts.map((post) => {
                      const isSelected = data.postId === post.id;
                      const thumb = post.thumbnail_url || post.media_url;

                      return (
                        <button
                          key={post.id}
                          type="button"
                          onClick={() => handleSelectPost(post.id, thumb, post.caption)}
                          className={cn(
                            "group relative rounded-xl overflow-hidden cursor-pointer text-left transition-all aspect-[4/5] focus:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                            isSelected
                              ? "ring-2 ring-primary ring-offset-2 ring-offset-background shadow-md"
                              : "ring-1 ring-border hover:ring-foreground/40"
                          )}
                          data-testid={`post-card-${post.id}`}
                        >
                          {thumb ? (
                            <img
                              src={thumb}
                              alt="Post"
                              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center bg-muted">
                              <Instagram className="w-6 h-6 text-muted-foreground/30" />
                            </div>
                          )}

                          <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-black/60 backdrop-blur-sm flex items-center justify-center">
                            {post.type === "reel" ? (
                              <PlaySquare className="w-3 h-3 text-white" />
                            ) : (
                              <Layers className="w-3 h-3 text-white" />
                            )}
                          </div>

                          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/50 to-transparent p-2.5 pt-6">
                            <p className="text-[11px] text-white font-medium line-clamp-2 leading-tight">
                              {post.caption || "No caption"}
                            </p>
                            <div className="flex items-center justify-between text-white/70 text-[10px] mt-1">
                              <span className="flex items-center gap-1">
                                <Heart className="w-2.5 h-2.5" />
                                {post.like_count}
                              </span>
                              <span className="flex items-center gap-1">
                                <MessageCircle className="w-2.5 h-2.5" />
                                {post.comments_count}
                              </span>
                            </div>
                          </div>

                          {isSelected && (
                            <div className="absolute top-2 left-2 w-6 h-6 bg-primary rounded-full flex items-center justify-center text-primary-foreground shadow-sm">
                              <Check className="w-3.5 h-3.5 stroke-[3]" />
                            </div>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Shared Reel DM Trigger */}
        {isReel && (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Reel Matching Scope
              </label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Choose whether to trigger when any Reel is shared or only a specific Reel.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => onUpdate({ postId: null, keywordsAnyMode: true })}
                className={cn(
                  "p-4 rounded-xl border text-left transition-all",
                  !data.postId || data.postId === "all"
                    ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                    : "border-border bg-card hover:bg-muted/40"
                )}
                data-testid="reel-scope-any"
              >
                <div className="flex items-center gap-2">
                  <Film className="w-4 h-4 text-primary" />
                  <span className="text-sm font-semibold text-foreground">
                    Any shared Reel (Recommended)
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Triggers whenever someone shares any of your Reels into your DMs.
                </p>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (!data.postId || data.postId === "all") {
                    onUpdate({ postId: specificReelInput || "specific_reel_target" });
                  }
                }}
                className={cn(
                  "p-4 rounded-xl border text-left transition-all",
                  data.postId && data.postId !== "all"
                    ? "border-primary bg-primary/5 ring-1 ring-primary/40"
                    : "border-border bg-card hover:bg-muted/40"
                )}
                data-testid="reel-scope-specific"
              >
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm font-semibold text-foreground">
                    Specific Reel Only
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  Triggers only when a specific Reel ID or link is shared.
                </p>
              </button>
            </div>

            {data.postId && data.postId !== "all" && (
              <div className="space-y-2 p-3.5 rounded-xl bg-card border border-border">
                <label className="text-xs font-semibold text-foreground">
                  Specific Reel ID or Media URL
                </label>
                <input
                  type="text"
                  value={specificReelInput}
                  onChange={(e) => {
                    setSpecificReelInput(e.target.value);
                    onUpdate({ postId: e.target.value });
                  }}
                  placeholder="e.g. 1792847291048291 or https://instagram.com/reel/..."
                  className="w-full px-3.5 py-2 rounded-lg bg-muted border border-border text-xs focus:outline-none focus:ring-1 focus:ring-primary"
                  data-testid="input-specific-reel"
                />
              </div>
            )}
          </div>
        )}

        {/* Direct Message Keyword */}
        {isDm && (
          <div className="p-4 rounded-xl bg-card border border-border flex items-start gap-3.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <Send className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">Direct Message Scope</h4>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                This automation applies to all private direct messages sent to your Instagram account. In the next step, you&apos;ll configure the trigger keywords.
              </p>
            </div>
          </div>
        )}

        {/* Story Reply */}
        {isStory && (
          <div className="p-4 rounded-xl bg-card border border-border flex items-start gap-3.5">
            <div className="w-8 h-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <ImageIcon className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-sm font-semibold text-foreground">Story Replies Scope</h4>
              <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                This automation applies to any reply sent to your currently published Instagram Stories.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

import Link from 'next/link';
import { LogoMark, LogoWordmark } from '@/components/ui/Logo';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { ArrowLeft, Shield, FileText, Trash2, Mail } from 'lucide-react';

interface LegalLayoutProps {
  title: string;
  subtitle: string;
  lastUpdated: string;
  activePath: '/privacy-policy' | '/terms' | '/data-deletion';
  children: React.ReactNode;
}

export function LegalLayout({
  title,
  subtitle,
  lastUpdated,
  activePath,
  children,
}: LegalLayoutProps) {
  const navItems = [
    { label: 'Privacy Policy', href: '/privacy-policy', icon: Shield, active: activePath === '/privacy-policy' },
    { label: 'Terms of Service', href: '/terms', icon: FileText, active: activePath === '/terms' },
    { label: 'Data Deletion', href: '/data-deletion', icon: Trash2, active: activePath === '/data-deletion' },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground flex flex-col font-sans relative selection:bg-primary/20">
      {/* Background Dotted Pattern */}
      <div
        className="fixed inset-0 z-0 opacity-[0.12] dark:opacity-25 pointer-events-none"
        style={{
          backgroundImage: `radial-gradient(circle at 1.5px 1.5px, currentColor 1.5px, transparent 0)`,
          backgroundSize: '32px 32px',
        }}
      />

      {/* Header */}
      <header className="sticky top-0 z-40 w-full border-b border-border bg-background/80 backdrop-blur-md transition-colors">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Link href="/" className="flex items-center space-x-2.5 group">
              <LogoMark className="w-8 h-8 drop-shadow-sm group-hover:scale-105 transition-transform" />
              <LogoWordmark className="text-lg" />
            </Link>
          </div>

          <div className="flex items-center space-x-4">
            <Link
              href="/"
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to App</span>
            </Link>
            <div className="h-4 w-px bg-border" />
            <ThemeToggle />
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 relative z-10 max-w-5xl mx-auto w-full px-4 sm:px-6 py-8 sm:py-12">
        {/* Document Header */}
        <div className="mb-8">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <span className="text-[11px] font-mono uppercase tracking-widest text-primary font-semibold bg-primary/10 px-2 py-0.5 rounded">
              Legal Documentation
            </span>
            <span className="text-[12px] text-muted-foreground">
              Last updated: {lastUpdated}
            </span>
          </div>
          <h1 className="text-3xl sm:text-4xl font-heading font-extrabold tracking-tight text-foreground mb-2">
            {title}
          </h1>
          <p className="text-base text-muted-foreground max-w-2xl leading-relaxed">
            {subtitle}
          </p>
        </div>

        {/* Tab Navigation */}
        <nav className="flex items-center gap-2 border-b border-border mb-8 overflow-x-auto pb-px">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`inline-flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium border-b-2 transition-colors whitespace-nowrap ${
                  item.active
                    ? 'border-foreground text-foreground font-semibold'
                    : 'border-transparent text-muted-foreground hover:text-foreground hover:border-border'
                }`}
              >
                <Icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Document Body Card */}
        <article className="bg-card border border-border rounded-xl shadow-sm p-6 sm:p-10 text-[14.5px] leading-relaxed text-foreground/90 space-y-8">
          {children}
        </article>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border mt-16 py-8 bg-card/50">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-[12px] text-muted-foreground">
          <div className="flex items-center gap-2">
            <LogoMark className="w-4 h-4 opacity-75" />
            <span>open-autoDM · Self-Hosted &amp; Open Source</span>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <Link href="/privacy-policy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
            <span>·</span>
            <Link href="/terms" className="hover:text-foreground transition-colors">Terms of Service</Link>
            <span>·</span>
            <Link href="/data-deletion" className="hover:text-foreground transition-colors">Data Deletion</Link>
            <span>·</span>
            <a href="mailto:work.techhacksai@gmail.com" className="inline-flex items-center gap-1 hover:text-foreground transition-colors">
              <Mail className="w-3 h-3" />
              <span>Contact Operator</span>
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}

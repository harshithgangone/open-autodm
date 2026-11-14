import { describe, it, expect, vi } from 'vitest';
import { isOptOutIntent, recordRecipientOptOut, isRecipientSuppressed } from './optOut';

describe('Opt-Out & Suppression Engine', () => {
  describe('isOptOutIntent — Text Classification', () => {
    describe('True Positive Opt-Out Commands & Phrases', () => {
      it('detects single-word uppercase and lowercase commands', () => {
        expect(isOptOutIntent('stop')).toBe(true);
        expect(isOptOutIntent('STOP')).toBe(true);
        expect(isOptOutIntent('Stop')).toBe(true);
        expect(isOptOutIntent('unsubscribe')).toBe(true);
        expect(isOptOutIntent('UNSUBSCRIBE')).toBe(true);
        expect(isOptOutIntent('cancel')).toBe(true);
        expect(isOptOutIntent('quit')).toBe(true);
        expect(isOptOutIntent('end')).toBe(true);
        expect(isOptOutIntent('optout')).toBe(true);
        expect(isOptOutIntent('opt out')).toBe(true);
        expect(isOptOutIntent('opt-out')).toBe(true);
      });

      it('detects commands with punctuation, symbols, and whitespace', () => {
        expect(isOptOutIntent('  stop  ')).toBe(true);
        expect(isOptOutIntent('stop!')).toBe(true);
        expect(isOptOutIntent('STOP!!')).toBe(true);
        expect(isOptOutIntent('"stop"')).toBe(true);
        expect(isOptOutIntent('#stop')).toBe(true);
        expect(isOptOutIntent('stop.')).toBe(true);
        expect(isOptOutIntent('unsubscribe!')).toBe(true);
      });

      it('detects polite opt-out phrasing', () => {
        expect(isOptOutIntent('please stop')).toBe(true);
        expect(isOptOutIntent('stop please')).toBe(true);
        expect(isOptOutIntent('please unsubscribe')).toBe(true);
        expect(isOptOutIntent('unsubscribe please')).toBe(true);
      });

      it('detects explicit multi-word opt-out requests', () => {
        expect(isOptOutIntent("don't dm me")).toBe(true);
        expect(isOptOutIntent("dont dm me")).toBe(true);
        expect(isOptOutIntent("do not dm me")).toBe(true);
        expect(isOptOutIntent("no dms")).toBe(true);
        expect(isOptOutIntent("no dm")).toBe(true);
        expect(isOptOutIntent("no direct messages")).toBe(true);
        expect(isOptOutIntent("stop dming me")).toBe(true);
        expect(isOptOutIntent("stop dm'ing")).toBe(true);
        expect(isOptOutIntent("stop messaging me")).toBe(true);
        expect(isOptOutIntent("stop sending me dms")).toBe(true);
        expect(isOptOutIntent("leave me alone")).toBe(true);
        expect(isOptOutIntent("remove me")).toBe(true);
      });
    });

    describe('False Positive Prevention (Conversational "stop" contexts)', () => {
      it('does NOT trigger on positive or enthusiastic expressions containing stop', () => {
        expect(isOptOutIntent("can't stop watching this!")).toBe(false);
        expect(isOptOutIntent("cant stop watching")).toBe(false);
        expect(isOptOutIntent("cannot stop listening to this reel")).toBe(false);
        expect(isOptOutIntent("won't stop sharing")).toBe(false);
        expect(isOptOutIntent("never stop creating")).toBe(false);
        expect(isOptOutIntent("don't stop making these")).toBe(false);
        expect(isOptOutIntent("dont stop posting")).toBe(false);
      });

      it('does NOT trigger on everyday nouns or idiomatic uses', () => {
        expect(isOptOutIntent("bus stop")).toBe(false);
        expect(isOptOutIntent("full stop")).toBe(false);
        expect(isOptOutIntent("pit stop")).toBe(false);
        expect(isOptOutIntent("one stop shop")).toBe(false);
        expect(isOptOutIntent("non-stop entertainment")).toBe(false);
        expect(isOptOutIntent("nonstop vibes")).toBe(false);
        expect(isOptOutIntent("stop by my profile")).toBe(false);
        expect(isOptOutIntent("stop scrolling and read this")).toBe(false);
      });

      it('does NOT trigger on normal trigger keywords or conversation', () => {
        expect(isOptOutIntent('LINK')).toBe(false);
        expect(isOptOutIntent('link please')).toBe(false);
        expect(isOptOutIntent('info')).toBe(false);
        expect(isOptOutIntent('yes')).toBe(false);
        expect(isOptOutIntent('🔥')).toBe(false);
      });

      it('safely handles empty or malformed inputs', () => {
        expect(isOptOutIntent('')).toBe(false);
        expect(isOptOutIntent('   ')).toBe(false);
        expect(isOptOutIntent(null)).toBe(false);
        expect(isOptOutIntent(undefined)).toBe(false);
      });
    });
  });

  describe('Database Operations', () => {
    it('recordRecipientOptOut calls RPC and falls back to upsert if RPC fails', async () => {
      // Mock db with failing RPC, successful upsert
      const mockUpsert = vi.fn().mockResolvedValue({ error: null });
      const mockDb: any = {
        rpc: vi.fn().mockResolvedValue({ data: null, error: new Error('RPC not found') }),
        from: vi.fn().mockReturnValue({
          upsert: mockUpsert,
        }),
      };

      const result = await recordRecipientOptOut(mockDb, {
        instagramAccountId: 'acc_123',
        recipientId: 'rec_456',
        triggerEventId: 'comment_789',
        text: 'STOP',
        reason: 'keyword',
      });

      expect(result).toBe(true);
      expect(mockDb.rpc).toHaveBeenCalledWith('record_recipient_opt_out', expect.objectContaining({
        p_instagram_account_id: 'acc_123',
        p_recipient_id: 'rec_456',
      }));
      expect(mockUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          instagram_account_id: 'acc_123',
          recipient_id: 'rec_456',
          trigger_event_id: 'comment_789',
          opt_out_text: 'STOP',
        }),
        expect.objectContaining({ onConflict: 'instagram_account_id,recipient_id' })
      );
    });

    it('isRecipientSuppressed returns true when recipient has an active opt-out', async () => {
      const mockDb: any = {
        rpc: vi.fn().mockResolvedValue({ data: true, error: null }),
      };

      const suppressed = await isRecipientSuppressed(mockDb, 'acc_123', 'rec_456');
      expect(suppressed).toBe(true);
      expect(mockDb.rpc).toHaveBeenCalledWith('is_recipient_suppressed', {
        p_instagram_account_id: 'acc_123',
        p_recipient_id: 'rec_456',
      });
    });

    it('isRecipientSuppressed falls back to direct select if RPC is unavailable', async () => {
      const mockMaybeSingle = vi.fn().mockResolvedValue({ data: { id: 'opt_1' }, error: null });
      const mockEq2 = vi.fn().mockReturnValue({ maybeSingle: mockMaybeSingle });
      const mockEq1 = vi.fn().mockReturnValue({ eq: mockEq2 });
      const mockSelect = vi.fn().mockReturnValue({ eq: mockEq1 });

      const mockDb: any = {
        rpc: vi.fn().mockResolvedValue({ data: null, error: new Error('RPC not found') }),
        from: vi.fn().mockReturnValue({
          select: mockSelect,
        }),
      };

      const suppressed = await isRecipientSuppressed(mockDb, 'acc_123', 'rec_456');
      expect(suppressed).toBe(true);
      expect(mockDb.from).toHaveBeenCalledWith('recipient_opt_outs');
      expect(mockEq1).toHaveBeenCalledWith('instagram_account_id', 'acc_123');
      expect(mockEq2).toHaveBeenCalledWith('recipient_id', 'rec_456');
    });

    it('isRecipientSuppressed returns false when recipient is not in opt-out list', async () => {
      const mockDb: any = {
        rpc: vi.fn().mockResolvedValue({ data: false, error: null }),
      };

      const suppressed = await isRecipientSuppressed(mockDb, 'acc_123', 'rec_new_user');
      expect(suppressed).toBe(false);
    });

    it('isRecipientSuppressed returns false for empty inputs without calling db', async () => {
      const mockDb: any = {
        rpc: vi.fn(),
      };

      expect(await isRecipientSuppressed(mockDb, '', 'rec_123')).toBe(false);
      expect(await isRecipientSuppressed(mockDb, 'acc_123', '')).toBe(false);
      expect(mockDb.rpc).not.toHaveBeenCalled();
    });
  });
});

'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAppDispatch, useAppSelector } from '@/store';
import {
  fetchTrustlines,
  addAccountTrustline,
  removeAccountTrustline,
} from '@/store/slices/accountSlice';
import { Trustline } from '@/types';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import {
  ShieldCheck,
  Plus,
  Trash2,
  RefreshCw,
  Copy,
  Check,
  AlertTriangle,
  AlertCircle,
  Coins,
  Info,
} from 'lucide-react';
import { formatAddress } from '@/utils/format';
import toast from 'react-hot-toast';

interface TrustlinesPanelProps {
  className?: string;
}

// Common verified Stellar anchor assets for quick addition
const POPULAR_ASSETS = [
  {
    code: 'USDC',
    issuer: 'GA5ZSEJYB37JRC5AVCIA5MOP4RHTM335X2KGX3IHOJAPP5RE34K4KZVN',
    name: 'USD Coin (Centre)',
  },
  {
    code: 'EURC',
    issuer: 'GDHU6WRG4IEQXM5NZ4BMPKOXHW76MZM4Y2IEMFDZOHOS3UWNLNQUR2U2',
    name: 'Euro Coin (Circle)',
  },
  {
    code: 'AQUA',
    issuer: 'GBNZILSTVQZ4R7IKQDGHYGY2QXL5QOFQDUGSNsQUETOTROODBIQUMGHA',
    name: 'Aquarius',
  },
];

export const TrustlinesPanel: React.FC<TrustlinesPanelProps> = ({ className = '' }) => {
  const dispatch = useAppDispatch();
  const { user } = useAppSelector((state) => state.auth);
  const { status, trustlines = [], isLoadingTrustlines, trustlinesError } = useAppSelector(
    (state) => state.account
  );

  const publicKey =
    status?.publicKey || status?.address || user?.publicKey || user?.address || '';

  const [assetCode, setAssetCode] = useState('');
  const [assetIssuer, setAssetIssuer] = useState('');
  const [limit, setLimit] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [removingAsset, setRemovingAsset] = useState<string | null>(null);
  const [copiedIssuer, setCopiedIssuer] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [warningMessage, setWarningMessage] = useState<string | null>(null);

  const loadTrustlines = useCallback(async () => {
    if (!publicKey) return;
    try {
      await dispatch(fetchTrustlines(publicKey)).unwrap();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err || 'Failed to fetch trustlines');
      toast.error(msg);
    }
  }, [dispatch, publicKey]);

  useEffect(() => {
    if (publicKey) {
      loadTrustlines();
    }
  }, [publicKey, loadTrustlines]);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedIssuer(id);
    toast.success('Issuer address copied');
    setTimeout(() => setCopiedIssuer(null), 2000);
  };

  const handleApplyPreset = (code: string, issuer: string) => {
    setAssetCode(code);
    setAssetIssuer(issuer);
    setFormError(null);
  };

  const handleAddTrustline = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setWarningMessage(null);

    const cleanCode = assetCode.trim().toUpperCase();
    const cleanIssuer = assetIssuer.trim();
    const cleanLimit = limit.trim();

    if (!cleanCode || cleanCode.length > 12) {
      setFormError('Asset code must be between 1 and 12 alphanumeric characters.');
      return;
    }
    if (!/^[A-Za-z0-9]+$/.test(cleanCode)) {
      setFormError('Asset code may only contain alphanumeric characters.');
      return;
    }
    if (!cleanIssuer || !cleanIssuer.startsWith('G') || cleanIssuer.length !== 56) {
      setFormError('Invalid Stellar issuer public key. Must start with "G" and be 56 characters.');
      return;
    }

    // Check if trustline already exists
    const existing = trustlines.find(
      (t) => t.assetCode.toUpperCase() === cleanCode && t.assetIssuer === cleanIssuer
    );
    if (existing) {
      setFormError(`A trustline for ${cleanCode} with this issuer already exists.`);
      return;
    }

    try {
      setIsAdding(true);
      await dispatch(
        addAccountTrustline({
          publicKey,
          data: {
            assetCode: cleanCode,
            assetIssuer: cleanIssuer,
            limit: cleanLimit || undefined,
          },
        })
      ).unwrap();

      toast.success(`Trustline for ${cleanCode} added successfully!`);
      setAssetCode('');
      setAssetIssuer('');
      setLimit('');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err || 'Failed to add trustline.');
      setFormError(msg);
      toast.error(msg);
    } finally {
      setIsAdding(false);
    }
  };

  const handleRemoveTrustline = async (item: Trustline) => {
    setFormError(null);
    setWarningMessage(null);

    const balanceNum = parseFloat(item.balance || '0');
    if (balanceNum > 0) {
      const warning = `Cannot remove trustline for ${item.assetCode}: you have a remaining balance of ${item.balance} ${item.assetCode}. Transfer or burn this balance first.`;
      setWarningMessage(warning);
      toast.error(warning);
      return;
    }

    const key = `${item.assetCode}-${item.assetIssuer}`;
    try {
      setRemovingAsset(key);
      await dispatch(
        removeAccountTrustline({
          publicKey,
          assetCode: item.assetCode,
          assetIssuer: item.assetIssuer,
        })
      ).unwrap();
      toast.success(`Trustline for ${item.assetCode} removed.`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err || 'Failed to remove trustline.');
      setFormError(msg);
      toast.error(msg);
    } finally {
      setRemovingAsset(null);
    }
  };

  return (
    <Card className={`p-6 border border-white/10 bg-slate-900/60 backdrop-blur-md rounded-2xl shadow-xl ${className}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between pb-5 border-b border-white/10 gap-3">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h3 className="text-lg font-semibold text-white tracking-tight">Asset Trustlines</h3>
              <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                {trustlines.length}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Hold, send, and receive custom Stellar tokens (SEP-0041 / Horizon)
            </p>
          </div>
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={loadTrustlines}
          disabled={isLoadingTrustlines}
          className="text-slate-300 hover:text-white self-start sm:self-auto border border-white/10 bg-white/5"
        >
          <RefreshCw
            className={`h-4 w-4 mr-1.5 text-cyan-400 ${
              isLoadingTrustlines ? 'animate-spin' : ''
            }`}
          />
          Sync
        </Button>
      </div>

      {/* Warnings & Errors */}
      {warningMessage && (
        <div className="mt-4 p-3.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-xs text-amber-300 flex items-start space-x-2.5">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5 text-amber-400" />
          <div className="flex-1">
            <span className="font-semibold">Balance detected: </span>
            {warningMessage}
          </div>
          <button
            onClick={() => setWarningMessage(null)}
            className="text-amber-400 hover:text-white font-bold ml-2 text-sm"
          >
            ×
          </button>
        </div>
      )}

      {(formError || trustlinesError) && (
        <div className="mt-4 p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl text-xs text-red-300 flex items-start space-x-2.5">
          <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5 text-red-400" />
          <div className="flex-1">{formError || trustlinesError}</div>
          <button
            onClick={() => setFormError(null)}
            className="text-red-400 hover:text-white font-bold ml-2 text-sm"
          >
            ×
          </button>
        </div>
      )}

      {/* Established Trustlines List */}
      <div className="mt-6 space-y-3">
        {isLoadingTrustlines && trustlines.length === 0 ? (
          <div className="py-8 text-center text-slate-400">
            <RefreshCw className="h-6 w-6 animate-spin mx-auto text-cyan-400 mb-2" />
            <p className="text-sm">Fetching established trustlines...</p>
          </div>
        ) : trustlines.length === 0 ? (
          <div className="p-6 rounded-xl border border-dashed border-white/10 text-center bg-white/[0.02]">
            <Coins className="h-8 w-8 text-slate-500 mx-auto mb-2 opacity-70" />
            <p className="text-sm font-medium text-slate-300">No Custom Trustlines Established</p>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              You only have the native XLM trustline. Add a trustline below to interact with tokens like USDC, EURC, or custom assets.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {trustlines.map((item: Trustline) => {
              const itemKey = `${item.assetCode}-${item.assetIssuer}`;
              const isRemoving = removingAsset === itemKey;
              const hasBalance = parseFloat(item.balance || '0') > 0;

              return (
                <div
                  key={itemKey}
                  className="p-4 rounded-xl bg-slate-950/60 border border-white/10 hover:border-cyan-500/30 transition-all flex flex-col justify-between"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center space-x-2">
                        <span className="font-bold text-white text-base tracking-wide">
                          {item.assetCode}
                        </span>
                        <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-cyan-400/10 text-cyan-300 border border-cyan-400/20">
                          {item.assetType || 'Credit Asset'}
                        </span>
                      </div>
                      <div className="mt-1 flex items-baseline space-x-1.5">
                        <span className="text-xs text-slate-400">Balance:</span>
                        <span className="text-sm font-semibold text-slate-100 font-mono">
                          {item.balance}
                        </span>
                      </div>
                    </div>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRemoveTrustline(item)}
                      disabled={isRemoving}
                      title={hasBalance ? 'Cannot remove trustline while balance > 0' : 'Remove trustline'}
                      className="text-red-400 hover:text-red-300 hover:bg-red-500/10 h-8 px-2.5 text-xs"
                    >
                      {isRemoving ? (
                        <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <>
                          <Trash2 className="h-3.5 w-3.5 mr-1" />
                          Remove
                        </>
                      )}
                    </Button>
                  </div>

                  <div className="mt-3 pt-3 border-t border-white/5 space-y-1">
                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Limit:</span>
                      <span className="font-mono text-slate-300 truncate max-w-[140px]">
                        {parseFloat(item.limit || '0') > 1000000000 ? 'Maximum' : item.limit}
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-400">
                      <span>Issuer:</span>
                      <div className="flex items-center space-x-1">
                        <span className="font-mono text-slate-300">
                          {formatAddress(item.assetIssuer)}
                        </span>
                        <button
                          onClick={() => handleCopy(item.assetIssuer, itemKey)}
                          className="text-slate-400 hover:text-cyan-400 transition"
                          title="Copy issuer address"
                        >
                          {copiedIssuer === itemKey ? (
                            <Check className="h-3 w-3 text-green-400" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Quick Presets */}
      <div className="mt-6 pt-5 border-t border-white/10">
        <div className="flex items-center space-x-1.5 text-xs text-slate-400 mb-2">
          <Info className="h-3.5 w-3.5 text-cyan-400" />
          <span>Popular Verified Assets:</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {POPULAR_ASSETS.map((asset) => {
            const isAdded = trustlines.some(
              (t) => t.assetCode.toUpperCase() === asset.code && t.assetIssuer === asset.issuer
            );
            return (
              <button
                key={asset.code}
                type="button"
                onClick={() => handleApplyPreset(asset.code, asset.issuer)}
                className={`px-2.5 py-1 text-xs rounded-lg border transition flex items-center space-x-1.5 ${
                  isAdded
                    ? 'border-green-500/30 bg-green-500/10 text-green-400 opacity-80 cursor-default'
                    : 'border-white/10 bg-white/5 text-slate-300 hover:border-cyan-400/40 hover:text-cyan-200'
                }`}
              >
                <span className="font-semibold">{asset.code}</span>
                <span className="text-[10px] text-slate-400">({asset.name})</span>
                {isAdded && <Check className="h-3 w-3 text-green-400" />}
              </button>
            );
          })}
        </div>
      </div>

      {/* Add Trustline Form */}
      <form onSubmit={handleAddTrustline} className="mt-5 space-y-3.5">
        <h4 className="text-sm font-semibold text-white flex items-center space-y-1">
          <span>Add Custom Asset Trustline</span>
        </h4>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Input
            placeholder="Asset Code (e.g. USDC)"
            value={assetCode}
            onChange={(e) => setAssetCode(e.target.value.toUpperCase())}
            maxLength={12}
            required
            className="bg-slate-950/70 border-white/10 text-white font-mono placeholder:text-slate-500"
          />
          <Input
            placeholder="Limit (optional, default: 1,000,000)"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            className="bg-slate-950/70 border-white/10 text-white font-mono placeholder:text-slate-500"
          />
        </div>

        <Input
          placeholder="Issuer Public Address (G... 56 characters)"
          value={assetIssuer}
          onChange={(e) => setAssetIssuer(e.target.value)}
          maxLength={56}
          required
          className="bg-slate-950/70 border-white/10 text-white font-mono placeholder:text-slate-500"
        />

        <Button
          type="submit"
          disabled={isAdding || !publicKey}
          className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-medium py-2.5 rounded-xl shadow-lg shadow-cyan-500/20"
        >
          {isAdding ? (
            <span className="flex items-center justify-center">
              <RefreshCw className="h-4 w-4 animate-spin mr-2" />
              Establishing Trustline...
            </span>
          ) : (
            <span className="flex items-center justify-center">
              <Plus className="h-4 w-4 mr-1.5" />
              Add Trustline
            </span>
          )}
        </Button>
      </form>
    </Card>
  );
};

export default TrustlinesPanel;

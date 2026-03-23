"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useState, useEffect } from "react";
import { ADMIN_WALLET } from "@/lib/data";

interface MintFormData {
  // Basic Info
  type: "Card" | "Sealed Product";
  tcg: "Pokemon" | "One Piece" | "Dragon Ball" | "Yu-Gi-Oh" | "Sports" | "Other";
  name: string;

  // Card Details
  cardName: string;
  set: string;
  cardNumber: string;
  year: number | "";
  language: "English" | "Japanese" | "Chinese" | "Korean" | "French" | "German";
  variant: string;
  condition: "Graded" | "Near Mint" | "Lightly Played" | "Moderately Played" | "Heavily Played";

  // Grading (when condition = Graded)
  gradingCompany: "PSA" | "BGS" | "CGC";
  grade: string;
  gradeLabel: string;
  certNumber: string;

  // Sealed Details
  productName: string;
  sealedSet: string;
  sealedYear: number | "";
  sealedLanguage: "English" | "Japanese" | "Chinese" | "Korean" | "French" | "German";
  sealedTcg: "Pokemon" | "One Piece" | "Dragon Ball" | "Yu-Gi-Oh" | "Sports" | "Other";

  // Price Source
  priceSource: "Alt.xyz" | "TCGplayer" | "None";
  priceSourceId: string;
  priceSourceName: string; // display name from search result

  // Images
  frontImage: File | null;
  frontImagePreview: string;
  backImage: File | null;
  backImagePreview: string;

  // Recipient
  recipientWallet: string;
}

/** Embeddable form content (no auth check, no page wrapper) — used by admin tab */
export function MintFormContent() {
  return <MintFormInner />;
}

function MintFormInner() {
  const [formData, setFormData] = useState<MintFormData>({
    type: "Card",
    tcg: "Pokemon",
    name: "",
    cardName: "",
    set: "",
    cardNumber: "",
    year: "",
    language: "English",
    variant: "",
    condition: "Near Mint",
    gradingCompany: "PSA",
    grade: "",
    gradeLabel: "",
    certNumber: "",
    productName: "",
    sealedSet: "",
    sealedYear: "",
    sealedLanguage: "English",
    sealedTcg: "Pokemon",
    priceSource: "Alt.xyz",
    priceSourceId: "",
    priceSourceName: "",
    frontImage: null,
    frontImagePreview: "",
    backImage: null,
    backImagePreview: "",
    recipientWallet: "",
  });

  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);

  // Search Alt.xyz / TCGplayer for matching cards
  const handlePriceSourceSearch = async () => {
    setSearching(true);
    setSearchResults([]);
    try {
      const query = [formData.cardName, formData.variant, formData.set, formData.tcg, formData.language, formData.condition === "Graded" ? `${formData.gradingCompany} ${formData.grade}` : ""].filter(Boolean).join(" ");
      
      if (formData.priceSource === "Alt.xyz") {
        const res = await fetch(`/api/oracle?endpoint=search&q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const data = await res.json();
          const variants = data.variants || [];
          setSearchResults(variants.slice(0, 10).map((v: any) => ({
            id: v.assetId,
            name: v.name || v.subject,
            variety: v.variety,
            language: v.language,
            price: v.price ? `$${(v.price / 100).toFixed(0)}` : "—",
          })));
        }
      } else if (formData.priceSource === "TCGplayer") {
        const tcgQuery = [formData.cardName, formData.set, formData.tcg].filter(Boolean).join(" ");
        const res = await fetch(`/api/oracle?endpoint=tcgplayer-search&q=${encodeURIComponent(tcgQuery)}`);
        if (res.ok) {
          const data = await res.json();
          setSearchResults((data.results || []).slice(0, 10).map((r: any) => ({
            id: r.productId?.toString(),
            name: r.name,
            variety: r.printingType || r.variant || "",
            language: "",
            price: r.marketPrice ? `$${r.marketPrice.toFixed(2)}` : "—",
          })));
        }
      }
    } catch (e) {
      console.error("Price source search failed:", e);
    }
    setSearching(false);
  };

  const selectPriceSource = (result: any) => {
    setFormData(prev => ({
      ...prev,
      priceSourceId: result.id,
      priceSourceName: `${result.name} ${result.variety ? `[${result.variety}]` : ""} ${result.price}`.trim(),
    }));
    setSearchResults([]);
  };

  // Auto-generate name when relevant fields change
  useEffect(() => {
    let generatedName = "";
    if (formData.type === "Card") {
      if (formData.condition === "Graded") {
        generatedName = [formData.year, formData.cardName, formData.variant, formData.cardNumber ? `#${formData.cardNumber}` : "", formData.gradingCompany, formData.grade, formData.language, formData.set, formData.tcg].filter(Boolean).join(" ");
      } else {
        generatedName = [formData.year, formData.cardName, formData.variant, formData.cardNumber ? `#${formData.cardNumber}` : "", formData.condition, formData.language, formData.set, formData.tcg].filter(Boolean).join(" ");
      }
    } else {
      generatedName = [formData.sealedYear, formData.sealedTcg, formData.sealedSet, formData.productName, formData.sealedLanguage].filter(Boolean).join(" ");
    }
    setFormData(prev => ({ ...prev, name: generatedName }));
  }, [formData.type, formData.year, formData.cardName, formData.variant, formData.cardNumber, formData.condition, formData.gradingCompany, formData.grade, formData.language, formData.set, formData.tcg, formData.productName, formData.sealedSet, formData.sealedYear, formData.sealedLanguage, formData.sealedTcg]);

  const handleImageUpload = (field: 'frontImage' | 'backImage') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const previewField = field === 'frontImage' ? 'frontImagePreview' : 'backImagePreview';
        setFormData(prev => ({ ...prev, [field]: file, [previewField]: reader.result as string }));
      };
      reader.readAsDataURL(file);
    }
  };

  const generateMetadata = () => {
    const metadata: Record<string, any> = {
      name: formData.name, description: `${formData.type} listed on Artifacte`, image: formData.frontImagePreview || "", symbol: "Artifacte",
      attributes: [], properties: { category: "Trading Card", creators: [{ address: ADMIN_WALLET, share: 100 }] }
    };
    if (formData.type === "Card") {
      metadata.attributes.push(
        { trait_type: "Type", value: "Card" }, { trait_type: "TCG", value: formData.tcg }, { trait_type: "Card Name", value: formData.cardName },
        { trait_type: "Set", value: formData.set }, { trait_type: "Card Number", value: formData.cardNumber },
        { trait_type: "Year", value: formData.year?.toString() || "" }, { trait_type: "Language", value: formData.language },
        { trait_type: "Variant", value: formData.variant }, { trait_type: "Condition", value: formData.condition }
      );
      if (formData.condition === "Graded") {
        metadata.attributes.push(
          { trait_type: "Grading Company", value: formData.gradingCompany }, { trait_type: "Grade", value: formData.grade },
          { trait_type: "Grade Label", value: formData.gradeLabel }, { trait_type: "Cert Number", value: formData.certNumber }
        );
      }
    } else {
      metadata.attributes.push(
        { trait_type: "Type", value: "Sealed" }, { trait_type: "Product Name", value: formData.productName },
        { trait_type: "Set", value: formData.sealedSet }, { trait_type: "Year", value: formData.sealedYear?.toString() || "" },
        { trait_type: "Language", value: formData.sealedLanguage }, { trait_type: "TCG", value: formData.sealedTcg }
      );
    }
    // Price source mapping
    if (formData.priceSource !== "None" && formData.priceSourceId) {
      metadata.attributes.push(
        { trait_type: "Price Source", value: formData.priceSource },
        { trait_type: "Price Source ID", value: formData.priceSourceId }
      );
    }
    return metadata;
  };

  const handleMint = () => { alert("Ready to mint!\n\n" + JSON.stringify(generateMetadata(), null, 2)); };

  // Reuse the same JSX but without the page wrapper
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Form */}
      <div className="bg-dark-800 border border-white/10 rounded-xl p-8">
        <h3 className="font-serif text-xl font-bold text-white mb-6">Mint New NFT</h3>
        {/* Basic Info */}
        <div className="mb-6">
          <h4 className="text-gold-400 font-semibold mb-3">Basic Info</h4>
          <div className="grid grid-cols-2 gap-4 mb-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Type</label>
              <select value={formData.type} onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as any }))} className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500">
                <option value="Card">Card</option><option value="Sealed Product">Sealed Product</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">TCG</label>
              <select value={formData.tcg} onChange={(e) => setFormData(prev => ({ ...prev, tcg: e.target.value as any }))} className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500">
                <option value="Pokemon">Pokemon</option><option value="One Piece">One Piece</option><option value="Dragon Ball">Dragon Ball</option><option value="Yu-Gi-Oh">Yu-Gi-Oh</option><option value="Sports">Sports</option><option value="Other">Other</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Auto-Generated Name</label>
            <input type="text" value={formData.name} readOnly className="w-full bg-dark-700 border border-white/10 rounded-lg px-3 py-2 text-gray-300 text-sm cursor-not-allowed" />
          </div>
        </div>
        {/* Card Details */}
        {formData.type === "Card" && (
          <div className="mb-6">
            <h4 className="text-gold-400 font-semibold mb-3">Card Details</h4>
            <div className="mb-3"><label className="block text-sm text-gray-400 mb-1">Card Name</label><input type="text" value={formData.cardName} onChange={(e) => setFormData(prev => ({ ...prev, cardName: e.target.value }))} className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500" placeholder="e.g. Monkey D. Luffy" /></div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div><label className="block text-sm text-gray-400 mb-1">Set</label><input type="text" value={formData.set} onChange={(e) => setFormData(prev => ({ ...prev, set: e.target.value }))} className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500" placeholder="e.g. OP09" /></div>
              <div><label className="block text-sm text-gray-400 mb-1">Card Number</label><input type="text" value={formData.cardNumber} onChange={(e) => setFormData(prev => ({ ...prev, cardNumber: e.target.value }))} className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500" placeholder="e.g. 051" /></div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div><label className="block text-sm text-gray-400 mb-1">Year</label><input type="number" value={formData.year} onChange={(e) => setFormData(prev => ({ ...prev, year: e.target.value ? parseInt(e.target.value) : "" }))} className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500" /></div>
              <div><label className="block text-sm text-gray-400 mb-1">Language</label><select value={formData.language} onChange={(e) => setFormData(prev => ({ ...prev, language: e.target.value as any }))} className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500"><option value="English">English</option><option value="Japanese">Japanese</option><option value="Chinese">Chinese</option><option value="Korean">Korean</option><option value="French">French</option><option value="German">German</option></select></div>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div><label className="block text-sm text-gray-400 mb-1">Variant</label><input type="text" value={formData.variant} onChange={(e) => setFormData(prev => ({ ...prev, variant: e.target.value }))} className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500" placeholder="e.g. Manga Alternate Art" /></div>
              <div><label className="block text-sm text-gray-400 mb-1">Condition</label><select value={formData.condition} onChange={(e) => setFormData(prev => ({ ...prev, condition: e.target.value as any }))} className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500"><option value="Graded">Graded</option><option value="Near Mint">Near Mint</option><option value="Lightly Played">Lightly Played</option><option value="Moderately Played">Moderately Played</option><option value="Heavily Played">Heavily Played</option></select></div>
            </div>
            {formData.condition === "Graded" && (
              <div className="bg-dark-700 rounded-lg p-4 border border-white/5">
                <h5 className="text-gold-400 font-medium mb-2 text-sm">Grading Details</h5>
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div><label className="block text-xs text-gray-400 mb-1">Company</label><select value={formData.gradingCompany} onChange={(e) => setFormData(prev => ({ ...prev, gradingCompany: e.target.value as any }))} className="w-full bg-dark-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500"><option value="PSA">PSA</option><option value="BGS">BGS</option><option value="CGC">CGC</option></select></div>
                  <div><label className="block text-xs text-gray-400 mb-1">Grade</label><input type="text" value={formData.grade} onChange={(e) => setFormData(prev => ({ ...prev, grade: e.target.value }))} className="w-full bg-dark-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500" placeholder="10" /></div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div><label className="block text-xs text-gray-400 mb-1">Label</label><input type="text" value={formData.gradeLabel} onChange={(e) => setFormData(prev => ({ ...prev, gradeLabel: e.target.value }))} className="w-full bg-dark-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500" placeholder="GEM-MT" /></div>
                  <div><label className="block text-xs text-gray-400 mb-1">Cert #</label><input type="text" value={formData.certNumber} onChange={(e) => setFormData(prev => ({ ...prev, certNumber: e.target.value }))} className="w-full bg-dark-800 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500" /></div>
                </div>
              </div>
            )}
          </div>
        )}
        {/* Sealed Details */}
        {formData.type === "Sealed Product" && (
          <div className="mb-6">
            <h4 className="text-gold-400 font-semibold mb-3">Sealed Product Details</h4>
            <div className="mb-3"><label className="block text-sm text-gray-400 mb-1">Product Name</label><input type="text" value={formData.productName} onChange={(e) => setFormData(prev => ({ ...prev, productName: e.target.value }))} className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500" placeholder="e.g. Booster Box" /></div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div><label className="block text-sm text-gray-400 mb-1">Set</label><input type="text" value={formData.sealedSet} onChange={(e) => setFormData(prev => ({ ...prev, sealedSet: e.target.value }))} className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500" /></div>
              <div><label className="block text-sm text-gray-400 mb-1">Year</label><input type="number" value={formData.sealedYear} onChange={(e) => setFormData(prev => ({ ...prev, sealedYear: e.target.value ? parseInt(e.target.value) : "" }))} className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500" /></div>
            </div>
          </div>
        )}

        {/* Price Source */}
        <div className="mb-6">
          <h4 className="text-gold-400 font-semibold mb-3">Price Source</h4>
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Source</label>
              <select value={formData.priceSource} onChange={(e) => setFormData(prev => ({ ...prev, priceSource: e.target.value as any, priceSourceId: "", priceSourceName: "" }))} className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-gold-500">
                <option value="Alt.xyz">Alt.xyz (Graded)</option>
                <option value="TCGplayer">TCGplayer (Ungraded/Sealed)</option>
                <option value="None">None</option>
              </select>
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Source ID</label>
              <input type="text" value={formData.priceSourceId} onChange={(e) => setFormData(prev => ({ ...prev, priceSourceId: e.target.value }))} className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-gold-500" placeholder="Auto-filled from search" />
            </div>
          </div>
          {formData.priceSourceName && (
            <div className="mb-3 px-3 py-2 bg-green-900/20 border border-green-700/30 rounded-lg text-green-400 text-xs">✅ {formData.priceSourceName}</div>
          )}
          {formData.priceSource !== "None" && (
            <button type="button" onClick={handlePriceSourceSearch} disabled={searching || !formData.cardName} className={`w-full py-2 rounded-lg text-sm font-medium transition ${searching || !formData.cardName ? "bg-gray-700 text-gray-500 cursor-not-allowed" : "bg-dark-700 border border-gold-500/50 text-gold-400 hover:bg-dark-600"}`}>
              {searching ? "Searching..." : `Search ${formData.priceSource}`}
            </button>
          )}
          {searchResults.length > 0 && (
            <div className="mt-3 border border-white/10 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
              {searchResults.map((r, i) => (
                <button key={i} onClick={() => selectPriceSource(r)} className="w-full text-left px-3 py-2 hover:bg-dark-700 border-b border-white/5 last:border-0 transition">
                  <div className="text-white text-xs font-medium truncate">{r.name}</div>
                  <div className="text-gray-400 text-xs">{r.variety} {r.language ? `• ${r.language}` : ""} {r.price ? `• ${r.price}` : ""}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Images */}
        <div className="mb-6">
          <h4 className="text-gold-400 font-semibold mb-3">Images</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm text-gray-400 mb-1">Front</label>
              <input type="file" accept="image/*" onChange={handleImageUpload('frontImage')} className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-gold-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-gold-500 file:text-dark-900" />
              {formData.frontImagePreview && <img src={formData.frontImagePreview} alt="Front" className="mt-2 w-full h-24 object-cover rounded-lg border border-white/10" />}
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Back (Optional)</label>
              <input type="file" accept="image/*" onChange={handleImageUpload('backImage')} className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-2 text-white text-xs focus:outline-none focus:border-gold-500 file:mr-2 file:py-1 file:px-2 file:rounded file:border-0 file:text-xs file:bg-gold-500 file:text-dark-900" />
              {formData.backImagePreview && <img src={formData.backImagePreview} alt="Back" className="mt-2 w-full h-24 object-cover rounded-lg border border-white/10" />}
            </div>
          </div>
        </div>
        {/* Recipient */}
        <div className="mb-6">
          <h4 className="text-gold-400 font-semibold mb-3">Recipient</h4>
          <input type="text" value={formData.recipientWallet} onChange={(e) => setFormData(prev => ({ ...prev, recipientWallet: e.target.value }))} className="w-full bg-dark-900 border border-white/10 rounded-lg px-3 py-2 text-white text-sm font-mono focus:outline-none focus:border-gold-500" placeholder="Solana wallet address" />
        </div>
        <button onClick={handleMint} disabled={!formData.name || !formData.recipientWallet} className={`w-full py-3 rounded-lg font-semibold text-sm transition ${!formData.name || !formData.recipientWallet ? "bg-gray-600 text-gray-400 cursor-not-allowed" : "bg-gold-500 hover:bg-gold-600 text-dark-900"}`}>Ready to Mint</button>
      </div>
      {/* Metadata Preview */}
      <div className="bg-dark-800 border border-white/10 rounded-xl p-8">
        <h3 className="font-serif text-xl font-bold text-white mb-6">Metadata Preview</h3>
        <div className="bg-dark-700 rounded-lg p-4 border border-white/5 overflow-auto max-h-[600px]">
          <pre className="text-gray-300 text-xs whitespace-pre-wrap">{JSON.stringify(generateMetadata(), null, 2)}</pre>
        </div>
      </div>
    </div>
  );
}

export function MintContent() {
  const { publicKey, connected } = useWallet();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  const [formData, setFormData] = useState<MintFormData>({
    type: "Card",
    tcg: "Pokemon",
    name: "",
    cardName: "",
    set: "",
    cardNumber: "",
    year: "",
    language: "English",
    variant: "",
    condition: "Near Mint",
    gradingCompany: "PSA",
    grade: "",
    gradeLabel: "",
    certNumber: "",
    productName: "",
    sealedSet: "",
    sealedYear: "",
    sealedLanguage: "English",
    sealedTcg: "Pokemon",
    priceSource: "Alt.xyz",
    priceSourceId: "",
    priceSourceName: "",
    frontImage: null,
    frontImagePreview: "",
    backImage: null,
    backImagePreview: "",
    recipientWallet: "",
  });

  useEffect(() => {
    if (connected && publicKey) {
      const walletAddress = publicKey.toBase58();
      if (walletAddress === ADMIN_WALLET) {
        setIsAdmin(true);
      }
    }
    setLoading(false);
  }, [connected, publicKey]);

  // Auto-generate name when relevant fields change
  useEffect(() => {
    let generatedName = "";
    
    if (formData.type === "Card") {
      if (formData.condition === "Graded") {
        generatedName = [
          formData.year,
          formData.cardName,
          formData.variant,
          formData.cardNumber ? `#${formData.cardNumber}` : "",
          formData.gradingCompany,
          formData.grade,
          formData.language,
          formData.set,
          formData.tcg
        ].filter(Boolean).join(" ");
      } else {
        generatedName = [
          formData.year,
          formData.cardName,
          formData.variant,
          formData.cardNumber ? `#${formData.cardNumber}` : "",
          formData.condition,
          formData.language,
          formData.set,
          formData.tcg
        ].filter(Boolean).join(" ");
      }
    } else if (formData.type === "Sealed Product") {
      generatedName = [
        formData.sealedYear,
        formData.sealedTcg,
        formData.sealedSet,
        formData.productName,
        formData.sealedLanguage
      ].filter(Boolean).join(" ");
    }

    setFormData(prev => ({ ...prev, name: generatedName }));
  }, [
    formData.type,
    formData.year,
    formData.cardName,
    formData.variant,
    formData.cardNumber,
    formData.condition,
    formData.gradingCompany,
    formData.grade,
    formData.language,
    formData.set,
    formData.tcg,
    formData.productName,
    formData.sealedSet,
    formData.sealedYear,
    formData.sealedLanguage,
    formData.sealedTcg
  ]);

  const handleImageUpload = (field: 'frontImage' | 'backImage') => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        const previewField = field === 'frontImage' ? 'frontImagePreview' : 'backImagePreview';
        setFormData(prev => ({
          ...prev,
          [field]: file,
          [previewField]: reader.result as string
        }));
      };
      reader.readAsDataURL(file);
    }
  };

  const generateMetadata = () => {
    const metadata: Record<string, any> = {
      name: formData.name,
      description: `${formData.type} listed on Artifacte`,
      image: formData.frontImagePreview || "",
      attributes: [],
      properties: {
        category: "Trading Card",
        creators: [{
          address: ADMIN_WALLET,
          share: 100
        }]
      }
    };

    if (formData.type === "Card") {
      metadata.attributes.push(
        { trait_type: "Type", value: formData.type },
        { trait_type: "TCG", value: formData.tcg },
        { trait_type: "Card Name", value: formData.cardName },
        { trait_type: "Set", value: formData.set },
        { trait_type: "Card Number", value: formData.cardNumber },
        { trait_type: "Year", value: formData.year?.toString() || "" },
        { trait_type: "Language", value: formData.language },
        { trait_type: "Variant", value: formData.variant },
        { trait_type: "Condition", value: formData.condition }
      );

      if (formData.condition === "Graded") {
        metadata.attributes.push(
          { trait_type: "Grading Company", value: formData.gradingCompany },
          { trait_type: "Grade", value: formData.grade },
          { trait_type: "Grade Label", value: formData.gradeLabel },
          { trait_type: "Cert Number", value: formData.certNumber }
        );
      }
    } else {
      metadata.attributes.push(
        { trait_type: "Type", value: formData.type },
        { trait_type: "Product Name", value: formData.productName },
        { trait_type: "Set", value: formData.sealedSet },
        { trait_type: "Year", value: formData.sealedYear?.toString() || "" },
        { trait_type: "Language", value: formData.sealedLanguage },
        { trait_type: "TCG", value: formData.sealedTcg }
      );
    }

    // Price source mapping
    if (formData.priceSource !== "None" && formData.priceSourceId) {
      metadata.attributes.push(
        { trait_type: "Price Source", value: formData.priceSource },
        { trait_type: "Price Source ID", value: formData.priceSourceId }
      );
    }
    return metadata;
  };

  const handleMint = () => {
    const metadata = generateMetadata();
    alert("Ready to mint!\n\nMetadata:\n" + JSON.stringify(metadata, null, 2));
  };

  if (loading) {
    return (
      <main className="min-h-screen bg-dark-900 pt-32 pb-20">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-block animate-spin">
            <div className="w-8 h-8 border-4 border-gray-700 border-t-gold-500 rounded-full" />
          </div>
          <p className="text-gray-400 mt-4">Loading...</p>
        </div>
      </main>
    );
  }

  if (!connected) {
    return (
      <main className="min-h-screen bg-dark-900 pt-32 pb-20">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-dark-800 border border-white/10 rounded-xl p-12 text-center">
            <h2 className="font-serif text-2xl font-bold text-white mb-4">Admin Access Required</h2>
            <p className="text-gray-400">Please connect your wallet to access the admin mint dashboard.</p>
          </div>
        </div>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="min-h-screen bg-dark-900 pt-32 pb-20">
        <div className="max-w-2xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="bg-red-900/20 border border-red-700 rounded-xl p-12 text-center">
            <h2 className="font-serif text-2xl font-bold text-white mb-4">Unauthorized</h2>
            <p className="text-gray-400">You do not have permission to access this page. Only the admin wallet can access the mint dashboard.</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-dark-900 pt-32 pb-20">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-12">
          <h1 className="font-serif text-4xl md:text-5xl font-bold text-white mb-4">Admin Mint Dashboard</h1>
          <p className="text-gray-400 text-lg">Mint trading cards and sealed products to the blockchain</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Mint Form */}
          <div className="bg-dark-800 border border-white/10 rounded-xl p-8">
            <h2 className="font-serif text-2xl font-bold text-white mb-6">Mint Form</h2>

            {/* Basic Info */}
            <div className="mb-8">
              <h3 className="text-gold-400 font-semibold mb-4 text-lg">Basic Info</h3>
              
              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2 font-medium">Type</label>
                  <select
                    value={formData.type}
                    onChange={(e) => setFormData(prev => ({ ...prev, type: e.target.value as "Card" | "Sealed Product" }))}
                    className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition"
                  >
                    <option value="Card">Card</option>
                    <option value="Sealed Product">Sealed Product</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2 font-medium">TCG</label>
                  <select
                    value={formData.tcg}
                    onChange={(e) => setFormData(prev => ({ ...prev, tcg: e.target.value as typeof formData.tcg }))}
                    className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition"
                  >
                    <option value="Pokemon">Pokemon</option>
                    <option value="One Piece">One Piece</option>
                    <option value="Dragon Ball">Dragon Ball</option>
                    <option value="Yu-Gi-Oh">Yu-Gi-Oh</option>
                    <option value="Sports">Sports</option>
                    <option value="Other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm text-gray-400 mb-2 font-medium">Auto-Generated Name</label>
                <input
                  type="text"
                  value={formData.name}
                  readOnly
                  className="w-full bg-dark-700 border border-white/10 rounded-lg px-4 py-2.5 text-gray-300 text-sm cursor-not-allowed"
                  placeholder="Name will be auto-generated from other fields"
                />
              </div>
            </div>

            {/* Card Details */}
            {formData.type === "Card" && (
              <div className="mb-8">
                <h3 className="text-gold-400 font-semibold mb-4 text-lg">Card Details</h3>
                
                <div className="grid grid-cols-1 gap-4 mb-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2 font-medium">Card Name</label>
                    <input
                      type="text"
                      value={formData.cardName}
                      onChange={(e) => setFormData(prev => ({ ...prev, cardName: e.target.value }))}
                      className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition"
                      placeholder="e.g. Monkey D. Luffy"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2 font-medium">Set</label>
                    <input
                      type="text"
                      value={formData.set}
                      onChange={(e) => setFormData(prev => ({ ...prev, set: e.target.value }))}
                      className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition"
                      placeholder="e.g. OP09 - Emperors in the New World"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-2 font-medium">Card Number</label>
                    <input
                      type="text"
                      value={formData.cardNumber}
                      onChange={(e) => setFormData(prev => ({ ...prev, cardNumber: e.target.value }))}
                      className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition"
                      placeholder="e.g. 051"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2 font-medium">Year</label>
                    <input
                      type="number"
                      value={formData.year}
                      onChange={(e) => setFormData(prev => ({ ...prev, year: e.target.value ? parseInt(e.target.value) : "" }))}
                      className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition"
                      placeholder="e.g. 2024"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-2 font-medium">Language</label>
                    <select
                      value={formData.language}
                      onChange={(e) => setFormData(prev => ({ ...prev, language: e.target.value as typeof formData.language }))}
                      className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition"
                    >
                      <option value="English">English</option>
                      <option value="Japanese">Japanese</option>
                      <option value="Chinese">Chinese</option>
                      <option value="Korean">Korean</option>
                      <option value="French">French</option>
                      <option value="German">German</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2 font-medium">Variant</label>
                    <input
                      type="text"
                      value={formData.variant}
                      onChange={(e) => setFormData(prev => ({ ...prev, variant: e.target.value }))}
                      className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition"
                      placeholder="e.g. Manga Alternate Art, Holo"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-2 font-medium">Condition</label>
                    <select
                      value={formData.condition}
                      onChange={(e) => setFormData(prev => ({ ...prev, condition: e.target.value as typeof formData.condition }))}
                      className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition"
                    >
                      <option value="Graded">Graded</option>
                      <option value="Near Mint">Near Mint</option>
                      <option value="Lightly Played">Lightly Played</option>
                      <option value="Moderately Played">Moderately Played</option>
                      <option value="Heavily Played">Heavily Played</option>
                    </select>
                  </div>
                </div>

                {/* Grading Details */}
                {formData.condition === "Graded" && (
                  <div className="bg-dark-700 rounded-lg p-4 border border-white/5">
                    <h4 className="text-gold-400 font-medium mb-3">Grading Details</h4>
                    
                    <div className="grid grid-cols-2 gap-4 mb-4">
                      <div>
                        <label className="block text-sm text-gray-400 mb-2 font-medium">Grading Company</label>
                        <select
                          value={formData.gradingCompany}
                          onChange={(e) => setFormData(prev => ({ ...prev, gradingCompany: e.target.value as typeof formData.gradingCompany }))}
                          className="w-full bg-dark-800 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition"
                        >
                          <option value="PSA">PSA</option>
                          <option value="BGS">BGS</option>
                          <option value="CGC">CGC</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-sm text-gray-400 mb-2 font-medium">Grade</label>
                        <input
                          type="text"
                          value={formData.grade}
                          onChange={(e) => setFormData(prev => ({ ...prev, grade: e.target.value }))}
                          className="w-full bg-dark-800 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition"
                          placeholder="e.g. 10, 9.5"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-sm text-gray-400 mb-2 font-medium">Grade Label</label>
                        <input
                          type="text"
                          value={formData.gradeLabel}
                          onChange={(e) => setFormData(prev => ({ ...prev, gradeLabel: e.target.value }))}
                          className="w-full bg-dark-800 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition"
                          placeholder="e.g. GEM-MT, PRISTINE"
                        />
                      </div>

                      <div>
                        <label className="block text-sm text-gray-400 mb-2 font-medium">Cert Number</label>
                        <input
                          type="text"
                          value={formData.certNumber}
                          onChange={(e) => setFormData(prev => ({ ...prev, certNumber: e.target.value }))}
                          className="w-full bg-dark-800 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition"
                          placeholder="Certificate number"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Sealed Details */}
            {formData.type === "Sealed Product" && (
              <div className="mb-8">
                <h3 className="text-gold-400 font-semibold mb-4 text-lg">Sealed Product Details</h3>
                
                <div className="grid grid-cols-1 gap-4 mb-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2 font-medium">Product Name</label>
                    <input
                      type="text"
                      value={formData.productName}
                      onChange={(e) => setFormData(prev => ({ ...prev, productName: e.target.value }))}
                      className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition"
                      placeholder="e.g. Booster Box"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2 font-medium">Set</label>
                    <input
                      type="text"
                      value={formData.sealedSet}
                      onChange={(e) => setFormData(prev => ({ ...prev, sealedSet: e.target.value }))}
                      className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition"
                      placeholder="e.g. Base Set"
                    />
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-2 font-medium">Year</label>
                    <input
                      type="number"
                      value={formData.sealedYear}
                      onChange={(e) => setFormData(prev => ({ ...prev, sealedYear: e.target.value ? parseInt(e.target.value) : "" }))}
                      className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition"
                      placeholder="e.g. 1998"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm text-gray-400 mb-2 font-medium">Language</label>
                    <select
                      value={formData.sealedLanguage}
                      onChange={(e) => setFormData(prev => ({ ...prev, sealedLanguage: e.target.value as typeof formData.sealedLanguage }))}
                      className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition"
                    >
                      <option value="English">English</option>
                      <option value="Japanese">Japanese</option>
                      <option value="Chinese">Chinese</option>
                      <option value="Korean">Korean</option>
                      <option value="French">French</option>
                      <option value="German">German</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm text-gray-400 mb-2 font-medium">TCG</label>
                    <select
                      value={formData.sealedTcg}
                      onChange={(e) => setFormData(prev => ({ ...prev, sealedTcg: e.target.value as typeof formData.sealedTcg }))}
                      className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition"
                    >
                      <option value="Pokemon">Pokemon</option>
                      <option value="One Piece">One Piece</option>
                      <option value="Dragon Ball">Dragon Ball</option>
                      <option value="Yu-Gi-Oh">Yu-Gi-Oh</option>
                      <option value="Sports">Sports</option>
                      <option value="Other">Other</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {/* Images */}
            <div className="mb-8">
              <h3 className="text-gold-400 font-semibold mb-4 text-lg">Images</h3>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-2 font-medium">Front Image</label>
                  <div className="relative">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload('frontImage')}
                      className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-gold-500 file:text-dark-900"
                    />
                  </div>
                  {formData.frontImagePreview && (
                    <div className="mt-3">
                      <img
                        src={formData.frontImagePreview}
                        alt="Front preview"
                        className="w-full h-32 object-cover rounded-lg border border-white/10"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-sm text-gray-400 mb-2 font-medium">Back Image (Optional)</label>
                  <div className="relative">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleImageUpload('backImage')}
                      className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-sm file:bg-gold-500 file:text-dark-900"
                    />
                  </div>
                  {formData.backImagePreview && (
                    <div className="mt-3">
                      <img
                        src={formData.backImagePreview}
                        alt="Back preview"
                        className="w-full h-32 object-cover rounded-lg border border-white/10"
                      />
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Recipient */}
            <div className="mb-8">
              <h3 className="text-gold-400 font-semibold mb-4 text-lg">Recipient</h3>
              
              <div>
                <label className="block text-sm text-gray-400 mb-2 font-medium">Wallet Address</label>
                <input
                  type="text"
                  value={formData.recipientWallet}
                  onChange={(e) => setFormData(prev => ({ ...prev, recipientWallet: e.target.value }))}
                  className="w-full bg-dark-900 border border-white/10 rounded-lg px-4 py-2.5 text-white text-sm focus:outline-none focus:border-gold-500 transition font-mono"
                  placeholder="Solana wallet address who receives the NFT"
                />
              </div>
            </div>

            {/* Mint Button */}
            <button
              onClick={handleMint}
              disabled={!formData.name || !formData.recipientWallet}
              className={`w-full py-3 rounded-lg font-semibold text-sm transition ${
                !formData.name || !formData.recipientWallet
                  ? "bg-gray-600 text-gray-400 cursor-not-allowed"
                  : "bg-gold-500 hover:bg-gold-600 text-dark-900"
              }`}
            >
              Ready to Mint
            </button>
          </div>

          {/* Metadata Preview */}
          <div className="bg-dark-800 border border-white/10 rounded-xl p-8">
            <h2 className="font-serif text-2xl font-bold text-white mb-6">Metadata Preview</h2>
            
            <div className="bg-dark-700 rounded-lg p-4 border border-white/5 overflow-auto max-h-[600px]">
              <pre className="text-gray-300 text-sm whitespace-pre-wrap">
                {JSON.stringify(generateMetadata(), null, 2)}
              </pre>
            </div>

            <div className="mt-6 bg-green-900/20 border border-green-700 rounded-lg p-4">
              <p className="text-green-400 text-sm font-medium mb-2">Ready to Mint</p>
              <p className="text-gray-400 text-xs">
                The metadata above will be uploaded to the blockchain when you click the mint button. 
                Review all details carefully before proceeding.
              </p>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
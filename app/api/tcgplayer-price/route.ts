import { NextResponse } from "next/server";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const productId = searchParams.get("id");

  if (!productId) {
    return NextResponse.json({ error: "Missing product id" }, { status: 400 });
  }

  try {
    const res = await fetch(
      `https://mpapi.tcgplayer.com/v2/product/${productId}/pricepoints`,
      { signal: AbortSignal.timeout(8000), cache: "no-store" }
    );

    if (!res.ok) {
      return NextResponse.json({ error: "TCGplayer API error" }, { status: 502 });
    }

    const data = await res.json();
    
    // Find best price: NM Foil > NM Normal > any Foil > any
    const nmFoil = data.find((p: any) => p.printingType === "Foil" && p.condition === "Near Mint");
    const nmNormal = data.find((p: any) => p.printingType === "Normal" && p.condition === "Near Mint");
    const anyFoil = data.find((p: any) => p.printingType === "Foil");
    const best = nmFoil || nmNormal || anyFoil || data[0];

    return NextResponse.json({
      productId,
      marketPrice: best?.marketPrice || null,
      listedMedianPrice: best?.listedMedianPrice || null,
      printingType: best?.printingType || null,
      condition: best?.condition || null,
      allPrices: data,
    }, {
      headers: { "Cache-Control": "public, max-age=900" }, // 15 min cache
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

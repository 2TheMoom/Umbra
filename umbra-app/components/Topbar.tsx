import Link from "next/link";

export function Topbar({ subtitle }: { subtitle?: string }) {
  return (
    <header className="bg-[#000] px-4 py-4 flex justify-between items-start gap-3 flex-wrap">
      <Link href="/" className="flex items-center gap-3 no-underline">
        {/* Ring mark: black variant (cream ring + yellow eclipse) */}
        <svg width="38" height="38" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <mask id="rm">
              <rect width="100" height="100" fill="black" />
              <circle cx="50" cy="50" r="42" fill="white" />
              <circle cx="50" cy="50" r="22" fill="black" />
            </mask>
            <clipPath id="rc">
              <rect x="0" y="26" width="100" height="74" />
            </clipPath>
          </defs>
          <g mask="url(#rm)" clipPath="url(#rc)">
            <rect width="100" height="100" fill="#f0ede7" />
            <circle cx="80" cy="28" r="48" fill="#ffd208" />
          </g>
        </svg>
        <div>
          <div className="text-[#f4f4f4] font-bold text-2xl tracking-widest leading-none">
            UMBRA
          </div>
          <div className="mono text-[#8a8a8f] text-[11px] tracking-[0.12em] mt-0.5">
            {subtitle ?? "CONFIDENTIAL PAYMENT GATE"}
          </div>
        </div>
      </Link>

      <div className="flex flex-col items-end gap-2">
        <span className="bg-[#ffd208] text-[#000] mono text-[10px] font-bold tracking-widest px-2 py-1 rounded">
          FHEVM · SEPOLIA
        </span>
        <div className="flex items-center gap-1.5 mono text-[11px] tracking-widest text-[#d8d8db]">
          <span
            className="live-dot w-[7px] h-[7px] rounded-full bg-[#1a6b3c]"
            style={{ boxShadow: "0 0 0 0 rgba(26,107,60,0.5)" }}
          />
          LIVE
        </div>
      </div>
    </header>
  );
}

import React, {useEffect, useState, type ReactNode} from 'react';
import {useDelayRender} from 'remotion';
import mark from '../assets/branding/layers.svg';
import {ink, type} from '../theme';

function FontGate({children}: {children: ReactNode}) {
  const {delayRender, continueRender, cancelRender} = useDelayRender();
  const [handle] = useState(() => delayRender('Typesetting the plate'));
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    const faces = ['400 60px "Source Serif 4"', 'italic 400 60px "Source Serif 4"',
      '400 36px "IBM Plex Sans"', '400 28px "IBM Plex Mono"'];
    Promise.all(faces.map(face => document.fonts.load(face))).then(results => {
      if (!active) return;
      if (results.some(fonts => fonts.length === 0)) throw new Error('Missing series font');
      setLoaded(true);
    }).catch(cancelRender);
    return () => { active = false; };
  }, [cancelRender]);
  useEffect(() => {
    if (loaded) continueRender(handle);
  }, [loaded, continueRender, handle]);
  return loaded ? children : null;
}

const ProductBranding = React.createContext(true);

export function SeriesPlate({number, productBranding = true, seriesAttribution = false, children}: {
  number: string; productBranding?: boolean; seriesAttribution?: boolean; children: ReactNode;
}) {
  return <FontGate><ProductBranding.Provider value={productBranding}>
    <svg viewBox="0 0 1080 1080" width="100%" height="100%" style={{background: ink.paper}}>
      <defs>
        <radialGradient id="field" cx="47%" cy="44%" r="78%">
          <stop stopColor="#1D292C" /><stop offset="1" stopColor="#13191D" />
        </radialGradient>
        <pattern id="points" width="26" height="26" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1.2" fill={ink.grey} opacity=".22" />
        </pattern>
        <pattern id="engraving" width="10" height="10" patternUnits="userSpaceOnUse"
          patternTransform="rotate(34)">
          <path d="M0 0V10" stroke={ink.cream} strokeWidth="1.3" opacity=".23" />
        </pattern>
      </defs>
      <rect width="1080" height="1080" fill="url(#field)" />
      <g fontFamily={type.mono} fontSize={26} fill={ink.cream} letterSpacing={2}>
        <image href={mark} x={76} y={60} width={50} height={50} />
        <text x={150} y={94}>
          {seriesAttribution ? 'Mutable OS ' : productBranding && 'MUTABLE '}
          <tspan fill={ink.entity}>{seriesAttribution ? '/ Concepts /' : productBranding ? '/ CONCEPTS /' : 'CONCEPTS /'}</tspan> {number}
        </text>
      </g>
      <path d="M76 140H1004" stroke={ink.rule} strokeWidth={1.5} />
      {children}
    </svg>
  </ProductBranding.Provider></FontGate>;
}

// Oblique leaves introduce the same range marks and endpoint guides that appear
// in the full diagram. The engraving and geometry remain vector at every scale.
function Folios({spread}: {spread: number}) {
  const levels = [
    {color: ink.entity, a: 434, b: 519},
    {color: ink.grammar, a: 485, b: 612},
    {color: ink.narrative, a: 434, b: 554},
  ];
  return <g>
    {levels.map(({color, a, b}, index) => {
      const y = 463 - index * (34 + spread * 27);
      return <g key={color}>
        <path d={`M345 ${y - 8} l224 -84 166 66 -224 85z`}
          fill="#253034" stroke={color} strokeWidth={2.4} />
        <path d={`M345 ${y - 8} l224 -84 166 66 -224 85z`} fill={color} opacity=".13" />
        <path d={`M345 ${y - 8} l224 -84 166 66 -224 85z`} fill="url(#engraving)" />
        <g transform={`translate(0 ${y}) skewY(-20.5)`}>
          <path d={`M${a} 164H${b}`} stroke={color} strokeWidth={5} />
          {[a, b].map(x => <circle key={x} cx={x} cy={164} r={5} fill={color} />)}
        </g>
      </g>;
    })}
  </g>;
}

export function Bookend({lead, emphasis, leadSize = 92, emphasisSize = 89, spread, opacity, imprintOpacity = 1, folioOpacity = 1, volumeLabel}: {
  lead: string; emphasis: string; leadSize?: number; emphasisSize?: number; spread: number; opacity: number; imprintOpacity?: number; folioOpacity?: number; volumeLabel?: string;
}) {
  const productBranding = React.useContext(ProductBranding);
  return <g opacity={opacity}>
    <g opacity={imprintOpacity*folioOpacity}><Folios spread={spread} /></g>
    <g textAnchor="middle" fontFamily={type.serif} fill={ink.cream}>
      <text x="540" y="679" fontSize={leadSize}>
        {lead}
      </text>
      <text x="540" y="782" fontSize={emphasisSize} fontStyle="italic" fill={ink.entity}>
        {emphasis}
      </text>
    </g>
    <g opacity={imprintOpacity}>
      <path d="M76 919H1004" stroke={ink.rule} strokeWidth="1.5" />
      <text x="76" y="981" fontFamily={type.serif} fontSize="36" fill={ink.cream}>{volumeLabel ?? (productBranding ? 'Mutable OS' : 'Volume I')}</text>
      <text x="1004" y="980" textAnchor="end" fontFamily={type.mono} fontSize="28" fill={ink.grey}>mutable.ink</text>
    </g>
  </g>;
}

export function Caption({text, opacity}: {text: string | readonly string[]; opacity: number}) {
  if (typeof text !== 'string') {
    return <g textAnchor="middle" fontFamily={type.sans} fontSize="42" fill={ink.cream} opacity={opacity}>
      {text.map((line, index) => <text key={line} x="540" y={949 + index * 50}>{line}</text>)}
    </g>;
  }
  return <text x="540" y="967" textAnchor="middle" fontFamily={type.sans} fontSize="42"
    fill={ink.cream} opacity={opacity}>{text}</text>;
}

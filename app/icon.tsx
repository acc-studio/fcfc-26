import { ImageResponse } from 'next/og';

// Image metadata
export const size = {
  width: 512,
  height: 512,
};
export const contentType = 'image/png';

// Image generation
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 24,
          background: '#0F1A15', // Pitch 900
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          borderRadius: '50%', // Circular icon for Android/Apple
        }}
      >
        {/* Container for the Vector Art */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            position: 'relative',
            width: '80%',
            height: '80%',
          }}
        >
          {/* 1. The Wreath (Abstract Wheat/Laurels) - CSS construct */}
          <svg
            width="400"
            height="400"
            viewBox="0 0 100 100"
            style={{ position: 'absolute' }}
          >
            {/* Left Stalk */}
            <path
              d="M 50 85 Q 10 65 20 20"
              fill="none"
              stroke="#D4AF37"
              strokeWidth="4"
              strokeLinecap="round"
            />
            {/* Right Stalk */}
            <path
              d="M 50 85 Q 90 65 80 20"
              fill="none"
              stroke="#D4AF37"
              strokeWidth="4"
              strokeLinecap="round"
            />
            {/* Grain details left */}
            <path d="M 25 40 L 15 35" stroke="#D4AF37" strokeWidth="3" strokeLinecap="round" />
            <path d="M 30 55 L 20 50" stroke="#D4AF37" strokeWidth="3" strokeLinecap="round" />
            <path d="M 38 70 L 30 68" stroke="#D4AF37" strokeWidth="3" strokeLinecap="round" />
            
            {/* Grain details right */}
            <path d="M 75 40 L 85 35" stroke="#D4AF37" strokeWidth="3" strokeLinecap="round" />
            <path d="M 70 55 L 80 50" stroke="#D4AF37" strokeWidth="3" strokeLinecap="round" />
            <path d="M 62 70 L 70 68" stroke="#D4AF37" strokeWidth="3" strokeLinecap="round" />
          </svg>

          {/* 2. The Socialist Star */}
          <svg
            width="240"
            height="240"
            viewBox="0 0 100 100"
            style={{ position: 'absolute', top: '20%' }}
          >
            {/* The Red Star */}
            <polygon
              points="50,5 61,40 98,40 68,60 79,95 50,75 21,95 32,60 2,40 39,40"
              fill="#FF4500"
              stroke="#0F1A15"
              strokeWidth="2"
            />
            
            {/* The Text "26" inside the star */}
          </svg>

          {/* The Text "26" inside the star */}
          <div
            style={{
              position: 'absolute',
              top: '20%',
              width: 240,
              height: 240,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              paddingTop: 40, // Push text down to align with star center (approx y=68 in SVG)
            }}
          >
            <div
              style={{
                fontSize: 84, // 35 * 2.4 scale factor
                fontFamily: 'monospace',
                fontWeight: 'bold',
                color: '#E8E6D9', // Paper
              }}
            >
              26
            </div>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
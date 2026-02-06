import { ImageResponse } from "next/og";

export const runtime = "edge";
export const alt =
  "SmartFormat — Идеальное оформление научной работы по методичке";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/* S-curve path from Logo component (white mark only) */
const FLOW_PATH =
  "M8 20 C8 13, 13 10, 16 10 C19.5 10, 19.5 14.5, 16 16.5 C12.5 18.5, 12.5 23, 16 23 C20 23, 24 18, 24 12";

// All beam paths joined for base grid
const ALL_BEAMS =
  "M-380 -189C-380 -189 -312 216 152 343C616 470 684 875 684 875M-352 -221C-352 -221 -284 184 180 311C644 438 712 843 712 843M-324 -253C-324 -253 -256 152 208 279C672 406 740 811 740 811M-296 -285C-296 -285 -228 120 236 247C700 374 768 779 768 779M-268 -317C-268 -317 -200 88 264 215C728 342 796 747 796 747M-240 -349C-240 -349 -172 56 292 183C756 310 824 715 824 715M-212 -381C-212 -381 -144 24 320 151C784 278 852 683 852 683M-184 -413C-184 -413 -116 -8 348 119C812 246 880 651 880 651M-156 -445C-156 -445 -88 -40 376 87C840 214 908 619 908 619M-128 -477C-128 -477 -60 -72 404 55C868 182 936 587 936 587M-100 -509C-100 -509 -32 -104 432 23C896 150 964 555 964 555M-72 -541C-72 -541 -4 -136 460 -9C924 118 992 523 992 523M-44 -573C-44 -573 24 -168 488 -41C952 86 1020 491 1020 491M-16 -605C-16 -605 52 -200 516 -73C980 54 1048 459 1048 459M12 -637C12 -637 80 -232 544 -105C1008 22 1076 427 1076 427";

// Individual beam paths for meteor highlights
const BEAM_2 = "M-352 -221C-352 -221 -284 184 180 311C644 438 712 843 712 843";
const BEAM_5 = "M-268 -317C-268 -317 -200 88 264 215C728 342 796 747 796 747";
const BEAM_8 = "M-184 -413C-184 -413 -116 -8 348 119C812 246 880 651 880 651";
const BEAM_11 = "M-100 -509C-100 -509 -32 -104 432 23C896 150 964 555 964 555";
const BEAM_14 = "M-16 -605C-16 -605 52 -200 516 -73C980 54 1048 459 1048 459";

export default async function Image() {
  const geologica = await fetch(
    "https://fonts.gstatic.com/s/geologica/v5/oY1o8evIr7j9P3TN9YwNAdyjzUyDKkKdAGOJh1UlCDUIhAIdhCZOn1fLsig7jfvCCPHZckU8H3G11_z-_OZqD_jsQ-M.ttf"
  ).then((res) => res.arrayBuffer());

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: "80px 100px",
          background: "#0a0a0f",
          position: "relative",
          overflow: "hidden",
        }}
      >
        {/* Background beams with static meteors */}
        <svg
          width="1200"
          height="630"
          viewBox="0 0 696 316"
          fill="none"
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
          }}
        >
          {/* Base beam grid — visible subtle lines */}
          <path d={ALL_BEAMS} stroke="#ffffff" strokeOpacity="0.06" strokeWidth="0.8" />

          {/* Bright meteor streaks on individual beams */}
          <path d={BEAM_2} stroke="#6344F5" strokeOpacity="0.5" strokeWidth="1.5" />
          <path d={BEAM_5} stroke="#8B5CF6" strokeOpacity="0.35" strokeWidth="1.2" />
          <path d={BEAM_8} stroke="#18CCFC" strokeOpacity="0.4" strokeWidth="1.3" />
          <path d={BEAM_11} stroke="#AE48FF" strokeOpacity="0.3" strokeWidth="1" />
          <path d={BEAM_14} stroke="#6344F5" strokeOpacity="0.45" strokeWidth="1.4" />
        </svg>

        {/* Subtle background glow */}
        <div
          style={{
            position: "absolute",
            bottom: "-200px",
            right: "-100px",
            width: "600px",
            height: "600px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(139,92,246,0.12) 0%, transparent 70%)",
            display: "flex",
          }}
        />

        {/* Top: Logo icon + SmartFormat name (small, left-aligned) */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "12px",
            marginBottom: "48px",
            position: "relative",
          }}
        >
          {/* White S-curve icon only (no purple bg) */}
          <svg width="36" height="36" viewBox="0 0 32 32" fill="none">
            <path
              d={FLOW_PATH}
              stroke="white"
              strokeWidth="3"
              strokeLinecap="round"
              strokeOpacity="0.8"
            />
          </svg>
          <span
            style={{
              fontSize: "28px",
              fontWeight: 700,
              fontFamily: "Geologica",
              color: "rgba(255,255,255,0.7)",
              letterSpacing: "-0.5px",
            }}
          >
            SmartFormat
          </span>
        </div>

        {/* Main headline (large, left-aligned) */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "8px",
            marginBottom: "48px",
            position: "relative",
          }}
        >
          <span
            style={{
              fontSize: "72px",
              fontWeight: 700,
              fontFamily: "Geologica",
              color: "white",
              lineHeight: 1.1,
              letterSpacing: "-2px",
            }}
          >
            Идеальное
          </span>
          <span
            style={{
              fontSize: "72px",
              fontWeight: 700,
              fontFamily: "Geologica",
              color: "white",
              lineHeight: 1.1,
              letterSpacing: "-2px",
            }}
          >
            оформление,
          </span>
          <span
            style={{
              fontSize: "72px",
              fontWeight: 700,
              fontFamily: "Geologica",
              color: "rgba(255,255,255,0.5)",
              lineHeight: 1.1,
              letterSpacing: "-2px",
            }}
          >
            по методичке
          </span>
        </div>

        {/* CTA button */}
        <div style={{ display: "flex", position: "relative" }}>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              padding: "14px 36px",
              borderRadius: "12px",
              background: "rgba(255,255,255,0.95)",
              fontSize: "20px",
              fontWeight: 700,
              fontFamily: "Geologica",
              color: "#0a0a0f",
              letterSpacing: "-0.3px",
            }}
          >
            Попробовать
          </div>
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        {
          name: "Geologica",
          data: geologica,
          style: "normal",
          weight: 700,
        },
      ],
    }
  );
}

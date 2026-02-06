import { ImageResponse } from "next/og";
import { getPostBySlug } from "@/lib/blog/posts";

export const runtime = "edge";
export const alt = "SmartFormat — Блог";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const FLOW_PATH =
  "M8 20 C8 13, 13 10, 16 10 C19.5 10, 19.5 14.5, 16 16.5 C12.5 18.5, 12.5 23, 16 23 C20 23, 24 18, 24 12";

// All beam paths joined for base grid
const ALL_BEAMS =
  "M-380 -189C-380 -189 -312 216 152 343C616 470 684 875 684 875M-352 -221C-352 -221 -284 184 180 311C644 438 712 843 712 843M-324 -253C-324 -253 -256 152 208 279C672 406 740 811 740 811M-296 -285C-296 -285 -228 120 236 247C700 374 768 779 768 779M-268 -317C-268 -317 -200 88 264 215C728 342 796 747 796 747M-240 -349C-240 -349 -172 56 292 183C756 310 824 715 824 715M-212 -381C-212 -381 -144 24 320 151C784 278 852 683 852 683M-184 -413C-184 -413 -116 -8 348 119C812 246 880 651 880 651M-156 -445C-156 -445 -88 -40 376 87C840 214 908 619 908 619M-128 -477C-128 -477 -60 -72 404 55C868 182 936 587 936 587M-100 -509C-100 -509 -32 -104 432 23C896 150 964 555 964 555M-72 -541C-72 -541 -4 -136 460 -9C924 118 992 523 992 523M-44 -573C-44 -573 24 -168 488 -41C952 86 1020 491 1020 491M-16 -605C-16 -605 52 -200 516 -73C980 54 1048 459 1048 459M12 -637C12 -637 80 -232 544 -105C1008 22 1076 427 1076 427";

// Individual beam paths for meteor highlights
const BEAM_3 = "M-324 -253C-324 -253 -256 152 208 279C672 406 740 811 740 811";
const BEAM_6 = "M-240 -349C-240 -349 -172 56 292 183C756 310 824 715 824 715";
const BEAM_9 = "M-156 -445C-156 -445 -88 -40 376 87C840 214 908 619 908 619";
const BEAM_12 = "M-72 -541C-72 -541 -4 -136 460 -9C924 118 992 523 992 523";
const BEAM_15 = "M12 -637C12 -637 80 -232 544 -105C1008 22 1076 427 1076 427";

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  const title = post?.title || "SmartFormat — Блог";

  const fontSize = title.length > 60 ? 40 : title.length > 40 ? 48 : 56;

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
          justifyContent: "space-between",
          padding: "60px 80px",
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
          {/* Base beam grid */}
          <path
            d={ALL_BEAMS}
            stroke="url(#beamsRadial)"
            strokeOpacity="0.04"
            strokeWidth="0.5"
          />

          {/* Meteor 1 */}
          <path d={BEAM_3} stroke="url(#m0)" strokeOpacity="0.4" strokeWidth="0.5" />
          {/* Meteor 2 */}
          <path d={BEAM_6} stroke="url(#m1)" strokeOpacity="0.35" strokeWidth="0.5" />
          {/* Meteor 3 */}
          <path d={BEAM_9} stroke="url(#m2)" strokeOpacity="0.4" strokeWidth="0.5" />
          {/* Meteor 4 */}
          <path d={BEAM_12} stroke="url(#m3)" strokeOpacity="0.3" strokeWidth="0.5" />
          {/* Meteor 5 */}
          <path d={BEAM_15} stroke="url(#m4)" strokeOpacity="0.35" strokeWidth="0.5" />

          <defs>
            <radialGradient
              id="beamsRadial"
              cx="0"
              cy="0"
              r="1"
              gradientUnits="userSpaceOnUse"
              gradientTransform="translate(352 34) rotate(90) scale(555 1560)"
            >
              <stop offset="0.067" stopColor="#d4d4d4" />
              <stop offset="0.243" stopColor="#d4d4d4" />
              <stop offset="0.436" stopColor="white" stopOpacity="0" />
            </radialGradient>

            {/* Meteor gradients — frozen at different positions */}
            <linearGradient id="m0" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="17%" stopColor="#18CCFC" stopOpacity="0" />
              <stop offset="25%" stopColor="#6344F5" />
              <stop offset="29%" stopColor="#AE48FF" stopOpacity="0" />
            </linearGradient>

            <linearGradient id="m1" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="35%" stopColor="#18CCFC" stopOpacity="0" />
              <stop offset="45%" stopColor="#6344F5" />
              <stop offset="50%" stopColor="#AE48FF" stopOpacity="0" />
            </linearGradient>

            <linearGradient id="m2" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="8%" stopColor="#18CCFC" stopOpacity="0" />
              <stop offset="15%" stopColor="#6344F5" />
              <stop offset="19%" stopColor="#AE48FF" stopOpacity="0" />
            </linearGradient>

            <linearGradient id="m3" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="51%" stopColor="#18CCFC" stopOpacity="0" />
              <stop offset="60%" stopColor="#6344F5" />
              <stop offset="65%" stopColor="#AE48FF" stopOpacity="0" />
            </linearGradient>

            <linearGradient id="m4" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="29%" stopColor="#18CCFC" stopOpacity="0" />
              <stop offset="35%" stopColor="#6344F5" />
              <stop offset="38%" stopColor="#AE48FF" stopOpacity="0" />
            </linearGradient>
          </defs>
        </svg>

        {/* Background glow */}
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

        {/* Top: Logo + Blog tag */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            position: "relative",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
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
                fontSize: "24px",
                fontWeight: 700,
                fontFamily: "Geologica",
                color: "rgba(255,255,255,0.7)",
                letterSpacing: "-0.5px",
              }}
            >
              SmartFormat
            </span>
          </div>
          <div
            style={{
              display: "flex",
              padding: "6px 16px",
              borderRadius: "8px",
              background: "rgba(139,92,246,0.15)",
              border: "1px solid rgba(139,92,246,0.3)",
              fontSize: "16px",
              fontWeight: 600,
              fontFamily: "Geologica",
              color: "rgba(139,92,246,0.9)",
            }}
          >
            Блог
          </div>
        </div>

        {/* Center: Post title */}
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            flex: 1,
            justifyContent: "center",
            paddingRight: "40px",
            position: "relative",
          }}
        >
          <span
            style={{
              fontSize: `${fontSize}px`,
              fontWeight: 700,
              fontFamily: "Geologica",
              color: "white",
              lineHeight: 1.2,
              letterSpacing: "-1.5px",
            }}
          >
            {title}
          </span>
        </div>

        {/* Bottom: URL */}
        <div style={{ display: "flex", position: "relative" }}>
          <span
            style={{
              fontSize: "18px",
              fontFamily: "Geologica",
              color: "rgba(255,255,255,0.3)",
            }}
          >
            ai-sformat.vercel.app
          </span>
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

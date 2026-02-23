import { ImageResponse } from "next/og";
import { getPostBySlug } from "@/lib/blog/posts";

export const runtime = "edge";
export const alt = "Diplox — Блог";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

import { D_ICON_WHITE_BASE64 } from "@/lib/logo/constants";

// Full beam grid (all 56 paths from BackgroundBeams component)
const ALL_BEAMS =
  "M-380 -189C-380 -189 -312 216 152 343C616 470 684 875 684 875M-373 -197C-373 -197 -305 208 159 335C623 462 691 867 691 867M-366 -205C-366 -205 -298 200 166 327C630 454 698 859 698 859M-359 -213C-359 -213 -291 192 173 319C637 446 705 851 705 851M-352 -221C-352 -221 -284 184 180 311C644 438 712 843 712 843M-345 -229C-345 -229 -277 176 187 303C651 430 719 835 719 835M-338 -237C-338 -237 -270 168 194 295C658 422 726 827 726 827M-331 -245C-331 -245 -263 160 201 287C665 414 733 819 733 819M-324 -253C-324 -253 -256 152 208 279C672 406 740 811 740 811M-317 -261C-317 -261 -249 144 215 271C679 398 747 803 747 803M-310 -269C-310 -269 -242 136 222 263C686 390 754 795 754 795M-303 -277C-303 -277 -235 128 229 255C693 382 761 787 761 787M-296 -285C-296 -285 -228 120 236 247C700 374 768 779 768 779M-289 -293C-289 -293 -221 112 243 239C707 366 775 771 775 771M-282 -301C-282 -301 -214 104 250 231C714 358 782 763 782 763M-275 -309C-275 -309 -207 96 257 223C721 350 789 755 789 755M-268 -317C-268 -317 -200 88 264 215C728 342 796 747 796 747M-261 -325C-261 -325 -193 80 271 207C735 334 803 739 803 739M-254 -333C-254 -333 -186 72 278 199C742 326 810 731 810 731M-247 -341C-247 -341 -179 64 285 191C749 318 817 723 817 723M-240 -349C-240 -349 -172 56 292 183C756 310 824 715 824 715M-233 -357C-233 -357 -165 48 299 175C763 302 831 707 831 707M-226 -365C-226 -365 -158 40 306 167C770 294 838 699 838 699M-219 -373C-219 -373 -151 32 313 159C777 286 845 691 845 691M-212 -381C-212 -381 -144 24 320 151C784 278 852 683 852 683M-205 -389C-205 -389 -137 16 327 143C791 270 859 675 859 675M-198 -397C-198 -397 -130 8 334 135C798 262 866 667 866 667M-191 -405C-191 -405 -123 0 341 127C805 254 873 659 873 659M-184 -413C-184 -413 -116 -8 348 119C812 246 880 651 880 651M-177 -421C-177 -421 -109 -16 355 111C819 238 887 643 887 643M-170 -429C-170 -429 -102 -24 362 103C826 230 894 635 894 635M-163 -437C-163 -437 -95 -32 369 95C833 222 901 627 901 627M-156 -445C-156 -445 -88 -40 376 87C840 214 908 619 908 619M-149 -453C-149 -453 -81 -48 383 79C847 206 915 611 915 611M-142 -461C-142 -461 -74 -56 390 71C854 198 922 603 922 603M-135 -469C-135 -469 -67 -64 397 63C861 190 929 595 929 595M-128 -477C-128 -477 -60 -72 404 55C868 182 936 587 936 587M-121 -485C-121 -485 -53 -80 411 47C875 174 943 579 943 579M-114 -493C-114 -493 -46 -88 418 39C882 166 950 571 950 571M-107 -501C-107 -501 -39 -96 425 31C889 158 957 563 957 563M-100 -509C-100 -509 -32 -104 432 23C896 150 964 555 964 555M-93 -517C-93 -517 -25 -112 439 15C903 142 971 547 971 547M-86 -525C-86 -525 -18 -120 446 7C910 134 978 539 978 539M-79 -533C-79 -533 -11 -128 453 -1C917 126 985 531 985 531M-72 -541C-72 -541 -4 -136 460 -9C924 118 992 523 992 523M-65 -549C-65 -549 3 -144 467 -17C931 110 999 515 999 515M-58 -557C-58 -557 10 -152 474 -25C938 102 1006 507 1006 507M-51 -565C-51 -565 17 -160 481 -33C945 94 1013 499 1013 499M-44 -573C-44 -573 24 -168 488 -41C952 86 1020 491 1020 491M-37 -581C-37 -581 31 -176 495 -49C959 78 1027 483 1027 483M-30 -589C-30 -589 38 -184 502 -57C966 70 1034 475 1034 475M-23 -597C-23 -597 45 -192 509 -65C973 62 1041 467 1041 467M-16 -605C-16 -605 52 -200 516 -73C980 54 1048 459 1048 459M-9 -613C-9 -613 59 -208 523 -81C987 46 1055 451 1055 451M-2 -621C-2 -621 66 -216 530 -89C994 38 1062 443 1062 443M5 -629C5 -629 73 -224 537 -97C1001 30 1069 435 1069 435M12 -637C12 -637 80 -232 544 -105C1008 22 1076 427 1076 427M19 -645C19 -645 87 -240 551 -113C1015 14 1083 419 1083 419";

// Individual meteor highlight paths (10 paths spread evenly)
const METEOR_1 = "M-359 -213C-359 -213 -291 192 173 319C637 446 705 851 705 851";
const METEOR_2 = "M-324 -253C-324 -253 -256 152 208 279C672 406 740 811 740 811";
const METEOR_3 = "M-289 -293C-289 -293 -221 112 243 239C707 366 775 771 775 771";
const METEOR_4 = "M-254 -333C-254 -333 -186 72 278 199C742 326 810 731 810 731";
const METEOR_5 = "M-219 -373C-219 -373 -151 32 313 159C777 286 845 691 845 691";
const METEOR_6 = "M-184 -413C-184 -413 -116 -8 348 119C812 246 880 651 880 651";
const METEOR_7 = "M-149 -453C-149 -453 -81 -48 383 79C847 206 915 611 915 611";
const METEOR_8 = "M-114 -493C-114 -493 -46 -88 418 39C882 166 950 571 950 571";
const METEOR_9 = "M-79 -533C-79 -533 -11 -128 453 -1C917 126 985 531 985 531";
const METEOR_10 = "M-44 -573C-44 -573 24 -168 488 -41C952 86 1020 491 1020 491";

// Build SVG as data URI string — bypasses Satori SVG viewBox clipping bug
function buildBeamsSvg(): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 696 316" fill="none" overflow="visible">
<path d="${ALL_BEAMS}" stroke="#d4d4d4" stroke-opacity="0.08" stroke-width="0.5"/>
<path d="${METEOR_1}" stroke="#32C6A5" stroke-opacity="0.3" stroke-width="0.5"/>
<path d="${METEOR_2}" stroke="#6344F5" stroke-opacity="0.4" stroke-width="0.5"/>
<path d="${METEOR_3}" stroke="#7029F8" stroke-opacity="0.25" stroke-width="0.5"/>
<path d="${METEOR_4}" stroke="#925FF6" stroke-opacity="0.35" stroke-width="0.5"/>
<path d="${METEOR_5}" stroke="#32C6A5" stroke-opacity="0.4" stroke-width="0.5"/>
<path d="${METEOR_6}" stroke="#6344F5" stroke-opacity="0.3" stroke-width="0.5"/>
<path d="${METEOR_7}" stroke="#7029F8" stroke-opacity="0.35" stroke-width="0.5"/>
<path d="${METEOR_8}" stroke="#32C6A5" stroke-opacity="0.25" stroke-width="0.5"/>
<path d="${METEOR_9}" stroke="#925FF6" stroke-opacity="0.4" stroke-width="0.5"/>
<path d="${METEOR_10}" stroke="#6344F5" stroke-opacity="0.3" stroke-width="0.5"/>
</svg>`;
}

export default async function Image({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const post = getPostBySlug(slug);
  const title = post?.title || "Diplox — Блог";

  const fontSize = title.length > 60 ? 40 : title.length > 40 ? 48 : 56;

  const geologica = await fetch(
    "https://fonts.gstatic.com/s/geologica/v5/oY1o8evIr7j9P3TN9YwNAdyjzUyDKkKdAGOJh1UlCDUIhAIdhCZOn1fLsig7jfvCCPHZckU8H3G11_z-_OZqD_jsQ-M.ttf"
  ).then((res) => res.arrayBuffer());

  const beamsSrc = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(buildBeamsSvg())}`;

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
        {/* Background beams as data URI img — bypasses Satori SVG clipping */}
        <img
          src={beamsSrc}
          width={1200}
          height={630}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
          }}
        />

        {/* Background glow */}
        <div
          style={{
            position: "absolute",
            bottom: "-120px",
            right: "-50px",
            width: "700px",
            height: "700px",
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(146,95,246,0.25) 0%, transparent 70%)",
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
            <img
              src={D_ICON_WHITE_BASE64}
              width={32}
              height={32}
              style={{ objectFit: "contain" }}
            />
            <span
              style={{
                fontSize: "24px",
                fontWeight: 700,
                fontFamily: "Geologica",
                color: "rgba(255,255,255,0.7)",
                letterSpacing: "-0.5px",
              }}
            >
              Diplox
            </span>
          </div>
          <div
            style={{
              display: "flex",
              padding: "6px 16px",
              borderRadius: "8px",
              background: "rgba(146,95,246,0.15)",
              border: "1px solid rgba(146,95,246,0.3)",
              fontSize: "16px",
              fontWeight: 600,
              fontFamily: "Geologica",
              color: "rgba(146,95,246,0.9)",
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
            diplox.online
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

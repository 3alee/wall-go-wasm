import { useEffect, useRef } from "react";

const piece_green = process.env.PUBLIC_URL + "/piece_green.png";
const piece_blue = process.env.PUBLIC_URL + "/piece_blue.png";
const piece_red = process.env.PUBLIC_URL + "/piece_red.png";
const piece_yellow = process.env.PUBLIC_URL + "/piece_yellow.png";
const wall_green = process.env.PUBLIC_URL + "/wall_green_h.png";
const wall_red = process.env.PUBLIC_URL + "/wall_blue_h.png";
const wall_yellow = process.env.PUBLIC_URL + "/wall_red_h.png";
const wall_blue = process.env.PUBLIC_URL + "/wall_yellow_h.png";


const images = [
  { src: piece_green, width: 40, height: 40 },
  { src: piece_green, width: 40, height: 40 },
  { src: piece_green, width: 40, height: 40 },
  { src: wall_green, width: 70, height: 20 },
  { src: wall_green, width: 70, height: 20 },
  { src: piece_red, width: 50, height: 50 },
  { src: piece_red, width: 50, height: 50 },
  { src: piece_red, width: 50, height: 50 },
  { src: wall_red, width: 70, height: 20 },
  { src: wall_red, width: 70, height: 20 },
  { src: piece_yellow, width: 50, height: 50 },
  { src: piece_yellow, width: 50, height: 50 },
  { src: piece_yellow, width: 50, height: 50 },
  { src: wall_yellow, width: 70, height: 20 },
  { src: wall_yellow, width: 70, height: 20 },
  { src: piece_blue, width: 50, height: 50 },
  { src: piece_blue, width: 50, height: 50 },
  { src: piece_blue, width: 50, height: 50 },
  { src: wall_blue, width: 70, height: 20 },
  { src: wall_blue, width: 70, height: 20 },
];

function BouncingImages() {
  const containerRef = useRef(null);
  const imgRefs = useRef([]);
  const velocities = useRef([]);
  const positions = useRef([]);
  const rotations = useRef([]);

  useEffect(() => {
    const container = containerRef.current;

    function initializeAndAnimate() {
        const containerRect = container.getBoundingClientRect();
        const numImages = images.length;

        positions.current = Array(numImages).fill(null).map(() => ({
            x: Math.random() * (containerRect.width - 60),
            y: Math.random() * (containerRect.height - 60),
        }));

        velocities.current = Array(numImages).fill(null).map(() => ({
            dx: (Math.random() - 0.5) * 3,
            dy: (Math.random() - 0.5) * 3,
        }));

        rotations.current = Array(numImages).fill(null).map(() => ({
            angle: 0,
            dr: (Math.random() - 0.5) * 4,
        }));

    function animate() {
        const containerRect = container.getBoundingClientRect();

        for (let i = 0; i < numImages; i++) {
            const img = imgRefs.current[i];
            const pos = positions.current[i];
            const vel = velocities.current[i];
            const rot = rotations.current[i];
            const imgData = images[i];

            pos.x += vel.dx;
            pos.y += vel.dy;
            rot.angle += rot.dr;

            // Bounce on X
            if (pos.x < 0 || pos.x > containerRect.width - imgData.width) {
                vel.dx *= -1;
                pos.x = Math.max(0, Math.min(containerRect.width - imgData.width, pos.x));
                rot.dr = (Math.random() < 0.5 ? -1 : 1) * Math.abs(vel.dy) * 2;
            }

            // Bounce on Y
            if (pos.y < 0 || pos.y > containerRect.height - imgData.height) {
                vel.dy *= -1;
                pos.y = Math.max(0, Math.min(containerRect.height - imgData.height, pos.y));
                rot.dr = (Math.random() < 0.5 ? -1 : 1) * Math.abs(vel.dx) * 2;
            }
            rot.angle += rot.dr;

            img.style.transform = `translate(${pos.x}px, ${pos.y}px) rotate(${rot.angle}deg)`;
        }

        requestAnimationFrame(animate);
      }

      animate();
    }

    // Delay animation start to ensure DOM is laid out
    const timeout = setTimeout(() => {
      initializeAndAnimate();
    }, 0);

    return () => clearTimeout(timeout);
  }, []);

  return (
    <div>
        <div
        ref={containerRef}
        style={{
            position: "fixed",
            top: 0,
            left: 0,
            width: "100vw",
            height: "100vh",
            overflow: "hidden",
            zIndex: -10,
        }}
        >
        {images.map((img, i) => (
            <img
            key={i}
            ref={(el) => (imgRefs.current[i] = el)}
            src={img.src}
            alt={`bounce-${i}`}
            width={img.width}
            height={img.height}
            style={{
                position: "absolute",
                left: 0,
                top: 0,
                willChange: "transform",
                pointerEvents: "none",
            }}
            />
        ))}
        </div>
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            backgroundColor: "rgba(255, 255, 255, 0)", // semi-transparent black
            borderRadius: "40px",
            zIndex: -5, // higher than bouncing images
            width: "100vw",
            height: "100vh",
            backdropFilter: "blur(4px)",
            WebkitBackdropFilter: "blur(4px)",
          }}
        >
        </div>
    </div>
  );
}

export default BouncingImages;

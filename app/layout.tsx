import type { Metadata, Viewport } from "next";
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gutsy Karts — 3D Procedural Kart Racer & Neuro-Evolutionary AI Lab",
  description:
    "A 100% procedural 3D kart racer built with Next.js and Babylon.js featuring a Hybrid Parametric + Neuro-Evolutionary (1+3) Elitist Evolution Strategy AI self-learning brain (23-parameter genome: 15 vehicle-dynamics/drift-PD weights + 8-weight tanh neural steering residual), Orthogonal Latin-Square character balance benchmarking, and cubic-mass Juggernaut physics.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

const aiTechnicalSchema = {
  "@context": "https://schema.org",
  "@type": "VideoGame",
  name: "Gutsy Karts",
  genre: ["Arcade Kart Racer", "AI Self-Learning Simulation"],
  applicationCategory: "Game",
  operatingSystem: "Web Browser (WebGL / Babylon.js)",
  description:
    "100% procedural 3D arcade kart racer featuring a Hybrid Parametric Control + Neuro-Evolutionary (1+3) Elitist Evolution Strategy AI self-learning system and asymmetric character balance.",
  featureList: [
    "Hybrid Parametric Control + Neuro-Evolutionary (1+3) Elitist Evolution Strategy AI Self-Learning System",
    "23-Parameter AI Policy Genome: 15 continuous spline look-ahead, apex-cutting, and closed-loop drift PD controller weights + 8-weight tanh-activated Neural Residual Perceptron",
    "Multi-Objective 60Hz Telemetry Fitness Function (0-100 score) rewarding kart-normalized top speed ratio, pavement/curb mastery, boosted off-road shortcuts, and Tier 1/2/3 Mini-Turbo conversions while penalizing grass drag, cross-track ping-pongs, and wall hits",
    "(1+3) Elitist Generation Evolution with Box-Muller Gaussian mutation, Champion x Runner-Up genetic crossover, and simulated annealing mutation scaling (0.68 down to 0.22)",
    "Orthogonal Latin-Square Rotation (16-episode cycle) decoupling starting grid slots (P1-P4) from AI policy genomes (Slot 0-3) for unbiased 25% win-rate character balance across Rex Ironclad (220kg Super Heavy), Aero Vance (120kg Balanced), Nyx Veloce (85kg Technical), and Pip Spark (50kg Featherweight)",
  ],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(aiTechnicalSchema),
          }}
        />
        <section
          aria-label="Gutsy Karts AI Self-Learning Technical Architecture"
          className="sr-only"
        >
          <h1>Gutsy Karts AI Self-Learning &amp; Neuro-Evolutionary Architecture</h1>
          <p>
            Gutsy Karts uses a Hybrid Parametric Control + Neuro-Evolutionary Strategy
            ((1+3) Elitist Evolution Strategy with a Neural Residual Policy) rather than
            a black-box neural network from scratch. Each AI racer executes a 23-parameter
            policy genome consisting of 15 continuous vehicle-dynamics and closed-loop
            drift PD controller weights plus an 8-weight tanh-activated neural residual
            steering perceptron evaluated at 60Hz (or 480Hz in 8x simulation mode).
          </p>
          <p>
            After every 3-lap episode, all 4 AI genomes are scored on a 0-100
            multi-objective telemetry fitness function measuring kart-stat-normalized
            speed ratio, asphalt/curb percentage, boosted off-road shortcut cuts, and
            Mini-Turbo frequency while penalizing unboosted grass drag, cross-track
            ping-pong oscillations, and wall hits. The next generation preserves the
            unmutated Elitist Champion in Slot 0, a Fine-Tuned Gaussian Mutant in Slot 1,
            a Champion x Runner-Up Genetic Crossover offspring in Slot 2, and a Wide
            Explorer mutant in Slot 3 with simulated annealing mutation decay (0.68 to
            0.22). Starting grid positions and AI genome slots rotate via an Orthogonal
            Latin-Square schedule every 16 episodes so Rex Ironclad (220kg), Aero Vance
            (120kg), Nyx Veloce (85kg), and Pip Spark (50kg) are benchmarked fairly toward
            an equal 25% win rate.
          </p>
        </section>
        {children}
        <Analytics />
        <SpeedInsights />
      </body>
    </html>
  );
}

/**
 * Project: Dodgeball Boss Rush
 * File: js/physics.js
 * Description: 2D Orthogonal Physics Engine & 2.5D Perspective Projection.
 * Includes circle/rect collisions, wall bounce normals, trajectory prediction with reflection rays,
 * and pseudo-45 degree Y-axis projection helpers.
 */

(function(window) {
  'use strict';

  const Physics = {
    // -------------------------------------------------------------
    // Vector & Math Utilities
    // -------------------------------------------------------------
    dist(x1, y1, x2, y2) {
      return Math.hypot(x2 - x1, y2 - y1);
    },

    length(x, y) {
      return Math.hypot(x, y);
    },

    normalize(x, y) {
      const len = Math.hypot(x, y);
      if (len < 0.0001) return { x: 0, y: 0 };
      return { x: x / len, y: y / len };
    },

    dot(x1, y1, x2, y2) {
      return x1 * x2 + y1 * y2;
    },

    // Reflect velocity (vx, vy) across surface normal (nx, ny)
    reflect(vx, vy, nx, ny) {
      const d = 2 * (vx * nx + vy * ny);
      return {
        x: vx - d * nx,
        y: vy - d * ny
      };
    },

    // Clamp value between min and max
    clamp(val, min, max) {
      return Math.max(min, Math.min(max, val));
    },

    // -------------------------------------------------------------
    // 2.5D Perspective Projection (Pseudo-45 Degree)
    // -------------------------------------------------------------
    toScreen(worldX, worldY, heightZ = 0, yScale = 0.75) {
      return {
        x: worldX,
        y: (worldY - heightZ) * yScale
      };
    },

    toWorld(screenX, screenY, yScale = 0.75) {
      return {
        x: screenX,
        y: screenY / yScale
      };
    },

    // -------------------------------------------------------------
    // Collision Detectors
    // -------------------------------------------------------------
    // Circle vs Circle
    circleCircle(x1, y1, r1, x2, y2, r2) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const minDist = r1 + r2;
      return (dx * dx + dy * dy) <= (minDist * minDist);
    },

    // Circle vs Axis-Aligned Rect
    circleRect(cx, cy, cr, rx, ry, rw, rh) {
      const closestX = this.clamp(cx, rx - rw / 2, rx + rw / 2);
      const closestY = this.clamp(cy, ry - rh / 2, ry + rh / 2);
      const dx = cx - closestX;
      const dy = cy - closestY;
      return (dx * dx + dy * dy) <= (cr * cr);
    },

    // Smooth Circle vs Circle Push-Out resolution (allows sliding along obstacle surface)
    resolveCirclePushOut(px, py, pr, ox, oy, or) {
      const dx = px - ox;
      const dy = py - oy;
      const dist = Math.hypot(dx, dy);
      const minDist = pr + or;
      if (dist < minDist) {
        if (dist < 0.0001) {
          return { collided: true, x: ox + minDist, y: oy, nx: 1, ny: 0 };
        }
        const overlap = minDist - dist;
        const nx = dx / dist;
        const ny = dy / dist;
        return {
          collided: true,
          x: px + nx * overlap,
          y: py + ny * overlap,
          nx,
          ny
        };
      }
      return { collided: false, x: px, y: py, nx: 0, ny: 0 };
    },

    // -------------------------------------------------------------
    // Arena Boundaries & Collisions
    // -------------------------------------------------------------
    checkArenaBoundary(x, y, radius, arenaConfig) {
      const shape = arenaConfig.shape;

      if (shape === 'circle') {
        const d = Math.hypot(x, y);
        const maxR = arenaConfig.radius - radius;
        if (d >= maxR) {
          // Normal pointing inward towards center
          const nx = -x / (d || 1);
          const ny = -y / (d || 1);
          return {
            collided: true,
            nx,
            ny,
            correctedX: -nx * maxR,
            correctedY: -ny * maxR
          };
        }
        return { collided: false };
      }

      if (shape === 'octagon') {
        // Octagon approximate with 8 planes
        const R = arenaConfig.radius - radius;
        const cos45 = Math.SQRT1_2;
        const normals = [
          { nx: -1, ny: 0, d: R },
          { nx: 1, ny: 0, d: R },
          { nx: 0, ny: -1, d: R },
          { nx: 0, ny: 1, d: R },
          { nx: -cos45, ny: -cos45, d: R },
          { nx: cos45, ny: -cos45, d: R },
          { nx: -cos45, ny: cos45, d: R },
          { nx: cos45, ny: cos45, d: R },
        ];

        for (const plane of normals) {
          const dist = x * (-plane.nx) + y * (-plane.ny);
          if (dist > plane.d) {
            return {
              collided: true,
              nx: plane.nx,
              ny: plane.ny,
              correctedX: x + plane.nx * (dist - plane.d),
              correctedY: y + plane.ny * (dist - plane.d)
            };
          }
        }
        return { collided: false };
      }

      // Default: Rectangle
      const halfW = arenaConfig.width / 2 - radius;
      const halfH = arenaConfig.height / 2 - radius;
      let collided = false;
      let nx = 0, ny = 0;
      let correctedX = x, correctedY = y;

      if (x < -halfW) {
        collided = true;
        nx = 1;
        correctedX = -halfW;
      } else if (x > halfW) {
        collided = true;
        nx = -1;
        correctedX = halfW;
      }

      if (y < -halfH) {
        collided = true;
        ny = 1;
        correctedY = -halfH;
      } else if (y > halfH) {
        collided = true;
        ny = -1;
        correctedY = halfH;
      }

      if (collided && nx !== 0 && ny !== 0) {
        const norm = this.normalize(nx, ny);
        nx = norm.x;
        ny = norm.y;
      }

      return { collided, nx, ny, correctedX, correctedY };
    },

    // -------------------------------------------------------------
    // Raycast Trajectory & Reflection Ray Prediction
    // Used during Aiming to draw trajectory line + 1st wall bounce line
    // -------------------------------------------------------------
    predictTrajectory(startX, startY, dirX, dirY, arenaConfig, hasWallBounce, maxDistance = 1200) {
      const seg1 = {
        x1: startX,
        y1: startY,
        x2: startX + dirX * maxDistance,
        y2: startY + dirY * maxDistance
      };

      const hit = this.raycastArena(startX, startY, dirX, dirY, arenaConfig, maxDistance);
      if (!hit) {
        return { primary: seg1, reflected: null };
      }

      seg1.x2 = hit.x;
      seg1.y2 = hit.y;

      if (!hasWallBounce) {
        return { primary: seg1, reflected: null };
      }

      // Compute reflected vector from wall normal
      const ref = this.reflect(dirX, dirY, hit.nx, hit.ny);
      const remainingDist = Math.max(100, maxDistance - hit.dist);
      const seg2Hit = this.raycastArena(hit.x, hit.y, ref.x, ref.y, arenaConfig, remainingDist);

      const seg2 = {
        x1: hit.x,
        y1: hit.y,
        x2: seg2Hit ? seg2Hit.x : (hit.x + ref.x * remainingDist),
        y2: seg2Hit ? seg2Hit.y : (hit.y + ref.y * remainingDist)
      };

      return {
        primary: seg1,
        reflected: seg2
      };
    },

    // Raycast against arena boundary
    raycastArena(ox, oy, dx, dy, arenaConfig, maxDist) {
      const shape = arenaConfig.shape;

      if (shape === 'circle') {
        const R = arenaConfig.radius;
        // Intersection of ray with circle x^2 + y^2 = R^2
        const b = 2 * (ox * dx + oy * dy);
        const c = ox * ox + oy * oy - R * R;
        const delta = b * b - 4 * c;
        if (delta >= 0) {
          const t = (-b + Math.sqrt(delta)) / 2;
          if (t > 0 && t <= maxDist) {
            const hx = ox + dx * t;
            const hy = oy + dy * t;
            return {
              x: hx,
              y: hy,
              nx: -hx / R,
              ny: -hy / R,
              dist: t
            };
          }
        }
        return null;
      }

      // Rectangle raycast
      const halfW = arenaConfig.width / 2;
      const halfH = arenaConfig.height / 2;
      let minT = maxDist;
      let hitNormal = null;

      // X boundaries: -halfW, +halfW
      if (Math.abs(dx) > 0.0001) {
        // Left
        const tLeft = (-halfW - ox) / dx;
        if (tLeft > 0 && tLeft < minT) {
          const yAtLeft = oy + dy * tLeft;
          if (yAtLeft >= -halfH && yAtLeft <= halfH) {
            minT = tLeft;
            hitNormal = { nx: 1, ny: 0 };
          }
        }
        // Right
        const tRight = (halfW - ox) / dx;
        if (tRight > 0 && tRight < minT) {
          const yAtRight = oy + dy * tRight;
          if (yAtRight >= -halfH && yAtRight <= halfH) {
            minT = tRight;
            hitNormal = { nx: -1, ny: 0 };
          }
        }
      }

      // Y boundaries: -halfH, +halfH
      if (Math.abs(dy) > 0.0001) {
        // Top
        const tTop = (-halfH - oy) / dy;
        if (tTop > 0 && tTop < minT) {
          const xAtTop = ox + dx * tTop;
          if (xAtTop >= -halfW && xAtTop <= halfW) {
            minT = tTop;
            hitNormal = { nx: 0, ny: 1 };
          }
        }
        // Bottom
        const tBottom = (halfH - oy) / dy;
        if (tBottom > 0 && tBottom < minT) {
          const xAtBottom = ox + dx * tBottom;
          if (xAtBottom >= -halfW && xAtBottom <= halfW) {
            minT = tBottom;
            hitNormal = { nx: 0, ny: -1 };
          }
        }
      }

      if (hitNormal) {
        return {
          x: ox + dx * minT,
          y: oy + dy * minT,
          nx: hitNormal.nx,
          ny: hitNormal.ny,
          dist: minT
        };
      }
      return null;
    },

    // -------------------------------------------------------------
    // Boss Hit Rebound Angle Calculator
    // Modes: Reflection | Refraction | Random
    // -------------------------------------------------------------
    calculateReboundVelocity(incomingVx, incomingVy, bossX, bossY, hitX, hitY, mode, varianceDeg = 15) {
      // Normal from boss center to hit point
      const rawNorm = this.normalize(hitX - bossX, hitY - bossY);
      const nx = rawNorm.x || 0;
      const ny = rawNorm.y || 1;

      let outVx = 0;
      let outVy = 0;

      if (mode === 'reflection') {
        // Incoming ray reflected against boss surface
        const ref = this.reflect(incomingVx, incomingVy, nx, ny);
        outVx = ref.x;
        outVy = ref.y;
      } else if (mode === 'refraction') {
        // Deflected by a fixed angle relative to normal
        const fixedAngle = 35 * (Math.PI / 180);
        const sign = Math.random() < 0.5 ? -1 : 1;
        const normAngle = Math.atan2(ny, nx) + sign * fixedAngle;
        outVx = Math.cos(normAngle);
        outVy = Math.sin(normAngle);
      } else {
        // Random fan in the hemisphere of boss normal
        const baseAngle = Math.atan2(ny, nx);
        const spreadRad = (varianceDeg * 2) * (Math.PI / 180);
        const randomAngle = baseAngle + (Math.random() - 0.5) * spreadRad;
        outVx = Math.cos(randomAngle);
        outVy = Math.sin(randomAngle);
      }

      // Add slight angle variance
      if (varianceDeg > 0 && mode === 'reflection') {
        const currentAngle = Math.atan2(outVy, outVx);
        const jitter = (Math.random() - 0.5) * 2 * (varianceDeg * Math.PI / 180);
        const finalAngle = currentAngle + jitter;
        outVx = Math.cos(finalAngle);
        outVy = Math.sin(finalAngle);
      }

      const outNorm = this.normalize(outVx, outVy);
      return outNorm;
    }
  };

  window.Physics = Physics;
})(window);

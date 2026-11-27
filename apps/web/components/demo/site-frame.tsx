'use client';

import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';

/** A website drawn at a real design width and scaled to the box it sits in, like the editor canvas does. */
export function SiteFrame({ node, design }: { node: ReactNode; design: number }) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [h, setH] = useState(600);
  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const update = () => {
      const s = el.clientWidth / design;
      setScale(s);
      setH(el.clientHeight / s);
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [design]);
  return (
    <div ref={box} className="demo-site" aria-hidden="true">
      <div inert style={{ width: design, height: h, transform: `scale(${scale})` }}>
        {node}
      </div>
    </div>
  );
}

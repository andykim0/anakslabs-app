/** Landing and generated sites share one progress-spine DOM contract and one runtime vocabulary. */
export function StoryProgressRail() {
  return (
    <div aria-hidden="true" data-story-progress-rail>
      <span data-story-progress-fill />
    </div>
  );
}

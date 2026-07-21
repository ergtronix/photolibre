from dataclasses import dataclass, field


@dataclass(frozen=True)
class AlbumReconciliation:
    merged: list[tuple[str, str]] = field(default_factory=list)
    review: list[tuple[str, str]] = field(default_factory=list)
    unmatched_a: list[str] = field(default_factory=list)
    unmatched_b: list[str] = field(default_factory=list)


def _normalize(name: str) -> str:
    return name.strip().casefold()


def reconcile_albums(
    source_a_names: list[str], source_b_names: list[str]
) -> AlbumReconciliation:
    remaining_b = list(source_b_names)
    merged: list[tuple[str, str]] = []
    review: list[tuple[str, str]] = []
    unmatched_a: list[str] = []

    for a_name in source_a_names:
        norm_a = _normalize(a_name)

        exact_match = next(
            (b for b in remaining_b if _normalize(b) == norm_a), None
        )
        if exact_match is not None:
            merged.append((a_name, exact_match))
            remaining_b.remove(exact_match)
            continue

        partial_match = next(
            (
                b
                for b in remaining_b
                if _normalize(b) in norm_a or norm_a in _normalize(b)
            ),
            None,
        )
        if partial_match is not None:
            review.append((a_name, partial_match))
            remaining_b.remove(partial_match)
            continue

        unmatched_a.append(a_name)

    return AlbumReconciliation(
        merged=merged, review=review, unmatched_a=unmatched_a, unmatched_b=remaining_b
    )

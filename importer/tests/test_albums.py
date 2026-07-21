from photolibre_importer.albums import reconcile_albums


def test_reconcile_albums_merges_exact_name_matches():
    result = reconcile_albums(
        source_a_names=["家族旅行2008"], source_b_names=["家族旅行2008"]
    )
    assert result.merged == [("家族旅行2008", "家族旅行2008")]
    assert result.review == []
    assert result.unmatched_a == []
    assert result.unmatched_b == []


def test_reconcile_albums_merges_names_differing_only_in_whitespace_or_case():
    result = reconcile_albums(
        source_a_names=["Family Trip 2008"], source_b_names=["  family trip 2008  "]
    )
    assert result.merged == [("Family Trip 2008", "  family trip 2008  ")]
    assert result.review == []


def test_reconcile_albums_flags_partial_overlap_as_ambiguous_for_review():
    result = reconcile_albums(
        source_a_names=["家族旅行"], source_b_names=["家族旅行2008"]
    )
    assert result.merged == []
    assert result.review == [("家族旅行", "家族旅行2008")]


def test_reconcile_albums_leaves_unrelated_names_untouched():
    result = reconcile_albums(
        source_a_names=["卒業式"], source_b_names=["運動会"]
    )
    assert result.merged == []
    assert result.review == []
    assert result.unmatched_a == ["卒業式"]
    assert result.unmatched_b == ["運動会"]


def test_reconcile_albums_handles_empty_inputs():
    result = reconcile_albums(source_a_names=[], source_b_names=[])
    assert result.merged == []
    assert result.review == []
    assert result.unmatched_a == []
    assert result.unmatched_b == []


def test_reconcile_albums_never_drops_a_name_silently():
    # 統合・要確認・未マッチのいずれかに必ず分類され、名前が消失しないこと
    source_a_names = ["A", "B"]
    source_b_names = ["A", "C"]

    result = reconcile_albums(source_a_names, source_b_names)

    all_a_mentions = (
        [m[0] for m in result.merged] + [r[0] for r in result.review] + result.unmatched_a
    )
    all_b_mentions = (
        [m[1] for m in result.merged] + [r[1] for r in result.review] + result.unmatched_b
    )
    assert sorted(all_a_mentions) == sorted(source_a_names)
    assert sorted(all_b_mentions) == sorted(source_b_names)

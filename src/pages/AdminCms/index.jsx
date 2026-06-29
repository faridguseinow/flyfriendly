import { useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  FilterX,
  Plus,
  RefreshCw,
  Upload,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useSearchParams } from "react-router-dom";
import { PermissionGate } from "../../admin/AdminGuards.jsx";
import { useAdminAuth } from "../../admin/AdminAuthContext.jsx";
import SimpleRichTextEditor from "../../admin/components/SimpleRichTextEditor.jsx";
import {
  AdminColumnTable,
  AdminFilterBar,
  AdminMetricsStrip,
  AdminSidePanel,
  AdminStatusBadge,
} from "../../admin/components/AdminUi.jsx";
import { languages } from "../../i18n/languages.js";
import { localizePath } from "../../i18n/path.js";
import { BLOG_IMAGE_MAX_FILE_SIZE, uploadBlogImage } from "../../lib/blogImageUpload.js";
import { buildAbsoluteUrl, SEO_LANGUAGES, isSeoLanguage } from "../../lib/seo.js";
import { sanitizeRichTextHtml } from "../../lib/richText.js";
import { supabase } from "../../lib/supabase.js";
import {
  createBlogPost,
  createBlogTranslationDraft,
  deleteBlogPost,
  fetchBlogModuleData,
  translateBlogPostWithSeo,
  updateBlogPost,
} from "../../services/adminService.js";
import "../AdminContent/style.scss";

const BLOG_LANGUAGE_OPTIONS = languages.filter((language) => SEO_LANGUAGES.includes(language.code));
const STATUS_OPTIONS = ["draft", "published", "archived", "scheduled"];
const emptyDraft = {
  id: null,
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  cover_image: "",
  cover_image_alt: "",
  author_name: "Fly Friendly",
  status: "draft",
  published_at: "",
  locale: "en",
  seo_title: "",
  seo_description: "",
  seo_keywords_input: "",
  canonical_override: "",
  translation_group_id: "",
  translated_from_id: "",
  translation_source_post_id: "",
};

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function formatDateTime(value) {
  if (!value) {
    return "";
  }

  try {
    return new Date(value).toLocaleString();
  } catch {
    return "";
  }
}

function formatEditorDateTime(value) {
  if (!value) {
    return "";
  }

  try {
    return new Date(value).toISOString().slice(0, 16);
  } catch {
    return "";
  }
}

function formatDateParts(value) {
  if (!value) {
    return { date: "—", time: "" };
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return { date: "—", time: "" };
  }

  return {
    date: date.toLocaleDateString(),
    time: date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  };
}

function parseKeywords(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function getTranslationKey(post) {
  if (post?.translation_group_id) {
    return `group:${post.translation_group_id}`;
  }

  if (post?.translated_from_id) {
    return `source:${post.translated_from_id}`;
  }

  return `slug:${post?.slug || post?.id || "post"}`;
}

function getGroupPosts(posts, post) {
  if (!post?.id) {
    return [];
  }

  const key = getTranslationKey(post);
  return posts
    .filter((item) => getTranslationKey(item) === key)
    .sort((left, right) => String(left.locale || "").localeCompare(String(right.locale || "")));
}

function hasDuplicateSlug(posts, post) {
  if (!post?.slug || !post?.locale) {
    return false;
  }

  return posts.some((item) => (
    item.id !== post.id
    && item.locale === post.locale
    && String(item.slug || "").trim().toLowerCase() === String(post.slug || "").trim().toLowerCase()
  ));
}

function buildPostWarnings(posts, post) {
  if (!post) {
    return [];
  }

  const warnings = [];
  if (!String(post.seo_title || "").trim()) {
    warnings.push("Missing SEO title.");
  }
  if (!String(post.seo_description || "").trim()) {
    warnings.push("Missing SEO description.");
  }
  if (!String(post.excerpt || "").trim()) {
    warnings.push("Missing excerpt.");
  }
  if (String(post.cover_image || "").trim() && !String(post.cover_image_alt || "").trim()) {
    warnings.push("Missing cover image alt text.");
  }
  if (hasDuplicateSlug(posts, post)) {
    warnings.push("Duplicate slug in this locale.");
  }

  return warnings;
}

function getMissingTranslationLocales(posts, post) {
  if (!post) {
    return BLOG_LANGUAGE_OPTIONS.map((item) => item.code);
  }

  const groupPosts = getGroupPosts(posts, post);
  const locales = new Set(groupPosts.map((item) => item.locale).filter(Boolean));
  return BLOG_LANGUAGE_OPTIONS
    .map((item) => item.code)
    .filter((code) => !locales.has(code));
}

function getSeoStatus(posts, post) {
  return buildPostWarnings(posts, post).length ? "missing" : "complete";
}

function buildTranslationOptions(posts, currentId) {
  return posts
    .filter((item) => item.id !== currentId)
    .map((item) => ({
      value: item.id,
      label: `${item.title || "Untitled"} (${item.locale || "en"})`,
    }));
}

function getStatusTone(status) {
  if (status === "published") return "success";
  if (status === "archived") return "danger";
  if (status === "scheduled") return "info";
  return "warning";
}

function getSeoTone(posts, post) {
  return getSeoStatus(posts, post) === "complete" ? "success" : "warning";
}

function getTranslationTone(posts, post) {
  return getMissingTranslationLocales(posts, post).length ? "warning" : "success";
}

function localizeBlogWarning(t, warning) {
  switch (warning) {
    case "Missing SEO title.":
      return t("admin.cms.editor.warnings.missingSeoTitle");
    case "Missing SEO description.":
      return t("admin.cms.editor.warnings.missingSeoDescription");
    case "Missing excerpt.":
      return t("admin.cms.editor.warnings.missingExcerpt");
    case "Missing cover image alt text.":
      return t("admin.cms.editor.warnings.missingCoverAlt");
    case "Duplicate slug in this locale.":
      return t("admin.cms.editor.warnings.duplicateSlug");
    default:
      return warning;
  }
}

export default function AdminCms() {
  const { t } = useTranslation();
  const [searchParams] = useSearchParams();
  const { hasPermission, isOwnerOrSuperAdmin } = useAdminAuth();
  const canEdit = isOwnerOrSuperAdmin || hasPermission("blog.edit") || hasPermission("cms.edit");
  const [moduleData, setModuleData] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [draft, setDraft] = useState(emptyDraft);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [localeFilter, setLocaleFilter] = useState("all");
  const [seoFilter, setSeoFilter] = useState("all");
  const [translationFilter, setTranslationFilter] = useState("all");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isTranslating, setIsTranslating] = useState(false);
  const [activeActionId, setActiveActionId] = useState("");
  const [previewOpen, setPreviewOpen] = useState(false);

  const loadModule = async ({ keepSelection = true, nextSelectedId = null } = {}) => {
    setError("");
    setNotice("");
    setIsLoading(true);

    try {
      const next = await fetchBlogModuleData();
      setModuleData(next);

      if (nextSelectedId) {
        setSelectedId(nextSelectedId);
      } else if (!keepSelection && next.posts[0]) {
        setSelectedId(next.posts[0].id);
      }
    } catch (nextError) {
      setError(nextError.message || t("admin.cms.loadError"));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadModule({ keepSelection: false });
  }, [t]);

  useEffect(() => {
    const deepLinkedPostId = searchParams.get("post");
    if (deepLinkedPostId) {
      setSelectedId(deepLinkedPostId);
      setPreviewOpen(true);
    }
  }, [searchParams]);

  const posts = moduleData?.posts || [];
  const canMutate = canEdit && moduleData?.supportsBlogSeoCmsV2 !== false;
  const filteredPosts = useMemo(() => {
    const query = search.trim().toLowerCase();

    return posts.filter((post) => {
      const matchesSearch = !query || [
        post.title,
        post.slug,
        post.excerpt,
        post.author_name,
        post.locale,
      ].some((value) => String(value || "").toLowerCase().includes(query));
      const matchesStatus = statusFilter === "all" || post.status === statusFilter;
      const matchesLocale = localeFilter === "all" || post.locale === localeFilter;
      const matchesSeo = seoFilter === "all" || getSeoStatus(posts, post) === seoFilter;
      const matchesTranslation = translationFilter === "all"
        || (translationFilter === "has" && getGroupPosts(posts, post).length > 1)
        || (translationFilter === "missing" && getMissingTranslationLocales(posts, post).length > 0);

      return matchesSearch && matchesStatus && matchesLocale && matchesSeo && matchesTranslation;
    });
  }, [posts, search, statusFilter, localeFilter, seoFilter, translationFilter]);

  const selectedPost = useMemo(
    () => filteredPosts.find((post) => post.id === selectedId) || posts.find((post) => post.id === selectedId) || null,
    [filteredPosts, posts, selectedId],
  );

  useEffect(() => {
    if (!selectedPost) {
      return;
    }

    setDraft({
      id: selectedPost.id,
      title: selectedPost.title || "",
      slug: selectedPost.slug || "",
      excerpt: selectedPost.excerpt || "",
      content: selectedPost.content || "",
      cover_image: selectedPost.cover_image || "",
      cover_image_alt: selectedPost.cover_image_alt || "",
      author_name: selectedPost.author_name || "",
      status: selectedPost.status || "draft",
      published_at: formatEditorDateTime(selectedPost.published_at),
      locale: selectedPost.locale || "en",
      seo_title: selectedPost.seo_title || "",
      seo_description: selectedPost.seo_description || "",
      seo_keywords_input: (selectedPost.seo_keywords || []).join(", "),
      canonical_override: selectedPost.canonical_override || "",
      translation_group_id: selectedPost.translation_group_id || "",
      translated_from_id: selectedPost.translated_from_id || "",
      translation_source_post_id: selectedPost.translated_from_id || "",
    });
  }, [selectedPost]);

  const metrics = useMemo(() => {
    const translationGroups = new Map();
    posts.forEach((post) => {
      const key = getTranslationKey(post);
      const group = translationGroups.get(key) || new Set();
      if (post.locale) {
        group.add(post.locale);
      }
      translationGroups.set(key, group);
    });

    const missingTranslations = Array.from(translationGroups.values()).filter((locales) => (
      BLOG_LANGUAGE_OPTIONS.some((item) => !locales.has(item.code))
    )).length;

    return [
      { label: t("admin.cms.metrics.total"), value: posts.length },
      { label: t("admin.cms.metrics.published"), value: posts.filter((post) => post.status === "published").length },
      { label: t("admin.cms.metrics.drafts"), value: posts.filter((post) => post.status === "draft").length },
      { label: t("admin.cms.metrics.languages"), value: new Set(posts.map((post) => post.locale).filter(Boolean)).size },
      { label: t("admin.cms.metrics.missingTranslations"), value: missingTranslations },
    ];
  }, [posts, t]);

  const groupPosts = useMemo(
    () => getGroupPosts(posts, selectedPost || draft),
    [posts, selectedPost, draft],
  );
  const missingTranslationLocales = useMemo(
    () => getMissingTranslationLocales(posts, selectedPost || draft),
    [posts, selectedPost, draft],
  );
  const draftWarnings = useMemo(() => buildPostWarnings(posts, {
    ...draft,
    slug: slugify(draft.slug || draft.title),
  }), [posts, draft]);

  const normalizedSlug = slugify(draft.slug || draft.title);
  const publicPath = normalizedSlug ? localizePath(`/blog/${normalizedSlug}`, draft.locale || "en") : "";
  const publicUrl = publicPath ? buildAbsoluteUrl(publicPath) : "";
  const canonicalPreview = String(draft.canonical_override || "").trim() || publicUrl;
  const isSitemapEligible = Boolean(draft.status === "published" && isSeoLanguage(draft.locale));
  const isSeoReady = Boolean(
    String(draft.seo_title || "").trim()
    && String(draft.seo_description || "").trim()
    && !hasDuplicateSlug(posts, { ...draft, slug: normalizedSlug })
  );
  const robotsPreview = isSeoReady && isSitemapEligible ? "index, follow" : "noindex, nofollow";
  const hreflangPreview = groupPosts
    .filter((post) => post.status === "published" && isSeoLanguage(post.locale))
    .map((post) => `${post.locale}: ${buildAbsoluteUrl(localizePath(`/blog/${post.slug}`, post.locale))}`);
  const translationOptions = useMemo(
    () => buildTranslationOptions(posts, draft.id),
    [posts, draft.id],
  );
  const translationActionLocales = useMemo(
    () => missingTranslationLocales.filter((locale) => locale !== draft.locale),
    [draft.locale, missingTranslationLocales],
  );
  const currentLanguageLabel = BLOG_LANGUAGE_OPTIONS.find((language) => language.code === (draft.locale || "en"))?.nativeLabel
    || (draft.locale || "en").toUpperCase();
  const currentStatusLabel = t(`admin.common.enums.${draft.status || "draft"}`, { defaultValue: draft.status || "draft" });
  const editorTitle = draft.id
    ? (draft.title || t("admin.cms.editor.editFallbackTitle"))
    : t("admin.cms.editor.newTitle");
  const editorSubtitle = draft.id
    ? `${currentLanguageLabel} • ${currentStatusLabel}`
    : t("admin.cms.editor.newSubtitle");
  const publishedMeta = draft.published_at
    ? `${t("admin.cms.editor.publishedAt")}: ${formatDateTime(draft.published_at)}`
    : t("admin.cms.editor.notPublishedYet");

  const countLabel = t("admin.cms.countLabel", { count: filteredPosts.length });

  const openPostEditor = (postId = null) => {
    setSelectedId(postId);
    setPreviewOpen(true);
  };

  const restoreSelectedDraft = () => {
    if (!selectedPost) {
      setDraft(emptyDraft);
      return;
    }

    setDraft({
      id: selectedPost.id,
      title: selectedPost.title || "",
      slug: selectedPost.slug || "",
      excerpt: selectedPost.excerpt || "",
      content: selectedPost.content || "",
      cover_image: selectedPost.cover_image || "",
      cover_image_alt: selectedPost.cover_image_alt || "",
      author_name: selectedPost.author_name || "",
      status: selectedPost.status || "draft",
      published_at: formatEditorDateTime(selectedPost.published_at),
      locale: selectedPost.locale || "en",
      seo_title: selectedPost.seo_title || "",
      seo_description: selectedPost.seo_description || "",
      seo_keywords_input: (selectedPost.seo_keywords || []).join(", "),
      canonical_override: selectedPost.canonical_override || "",
      translation_group_id: selectedPost.translation_group_id || "",
      translated_from_id: selectedPost.translated_from_id || "",
      translation_source_post_id: selectedPost.translated_from_id || "",
    });
  };

  const closePreview = () => {
    setPreviewOpen(false);
    if (!draft.id) {
      setSelectedId(null);
    }
  };

  const resetDraft = () => {
    setSelectedId(null);
    setDraft(emptyDraft);
    setError("");
    setNotice("");
    setPreviewOpen(false);
  };

  const startNewPost = () => {
    setSelectedId(null);
    setDraft(emptyDraft);
    setError("");
    setNotice("");
    setPreviewOpen(true);
  };

  const savePost = async () => {
    if (!canMutate) {
      setError("You do not have permission to edit blog content.");
      return;
    }

    if (!draft.title.trim()) {
      setError("Title is required.");
      return;
    }

    if (!draft.locale) {
      setError("Language is required.");
      return;
    }

    const nextSlug = slugify(draft.slug || draft.title);
    if (!nextSlug) {
      setError("Slug is required.");
      return;
    }

    if (hasDuplicateSlug(posts, { ...draft, slug: nextSlug })) {
      setError("Slug must be unique within the selected locale.");
      return;
    }

    setIsSaving(true);
    setError("");
    setNotice("");

    try {
      const payload = {
        title: draft.title.trim(),
        slug: nextSlug,
        excerpt: draft.excerpt.trim(),
        content: sanitizeRichTextHtml(draft.content),
        content_sections: [],
        cover_image: draft.cover_image.trim(),
        cover_image_alt: draft.cover_image_alt.trim(),
        author_name: draft.author_name.trim(),
        status: draft.status,
        published_at: draft.published_at ? new Date(draft.published_at).toISOString() : null,
        locale: draft.locale,
        seo_title: draft.seo_title.trim(),
        seo_description: draft.seo_description.trim(),
        seo_keywords: parseKeywords(draft.seo_keywords_input),
        canonical_override: draft.canonical_override.trim(),
        translation_group_id: draft.translation_group_id || null,
        translated_from_id: draft.translated_from_id || null,
        translation_source_post_id: draft.translation_source_post_id || null,
      };

      const result = draft.id
        ? await updateBlogPost(draft.id, payload)
        : await createBlogPost(payload);

      await loadModule({ nextSelectedId: draft.id || result?.id || null });
      setPreviewOpen(true);
      setNotice(draft.status === "published"
        ? "Blog post saved. Run a deploy/build to refresh sitemap.xml."
        : "Blog post saved.");
    } catch (nextError) {
      setError(nextError.message || "Could not save blog post.");
    } finally {
      setIsSaving(false);
    }
  };

  const updatePostStatus = async (post, status) => {
    if (!canMutate || !post?.id) {
      return;
    }

    setActiveActionId(post.id);
    setError("");
    setNotice("");

    try {
      await updateBlogPost(post.id, {
        ...post,
        status,
        published_at: status === "published"
          ? (post.published_at || new Date().toISOString())
          : post.published_at || null,
        translation_source_post_id: post.translated_from_id || null,
      });
      await loadModule({ nextSelectedId: post.id });
      setPreviewOpen(true);
      setNotice(status === "published"
        ? "Post published. Sitemap will update on the next build/deploy."
        : status === "draft"
          ? "Post moved back to draft."
          : "Post archived.");
    } catch (nextError) {
      setError(nextError.message || "Could not update post status.");
    } finally {
      setActiveActionId("");
    }
  };

  const removePost = async (post) => {
    if (!canMutate || !post?.id) {
      return;
    }

    const confirmed = window.confirm(`Delete "${post.title || "this post"}"? This action cannot be undone.`);
    if (!confirmed) {
      return;
    }

    setActiveActionId(post.id);
    setError("");
    setNotice("");

    try {
      await deleteBlogPost(post.id);
      await loadModule({ keepSelection: false, nextSelectedId: null });
      setSelectedId(null);
      setDraft(emptyDraft);
      setPreviewOpen(false);
      setNotice("Blog post deleted.");
    } catch (nextError) {
      setError(nextError.message || "Could not delete the blog post.");
    } finally {
      setActiveActionId("");
    }
  };

  const createTranslation = async (targetLocale) => {
    if (!canMutate || !selectedPost?.id) {
      return;
    }

    setActiveActionId(selectedPost.id);
    setError("");
    setNotice("");

    try {
      const result = await createBlogTranslationDraft(selectedPost.id, targetLocale);
      await loadModule({ nextSelectedId: result?.id || null });
      setPreviewOpen(true);
      setNotice(`Draft duplicate created for ${targetLocale}. Translate and review it before publishing.`);
    } catch (nextError) {
      setError(nextError.message || "Could not create translation draft.");
    } finally {
      setActiveActionId("");
    }
  };

  const autoTranslateToLocale = async (targetLocale) => {
    if (!canMutate || !selectedPost?.id) {
      return;
    }

    setIsTranslating(true);
    setActiveActionId(selectedPost.id);
    setError("");
    setNotice("");

    try {
      let targetPost = posts.find((post) => (
        post.id !== selectedPost.id
        && getTranslationKey(post) === getTranslationKey(selectedPost)
        && post.locale === targetLocale
      )) || null;

      if (!targetPost) {
        const createdDraft = await createBlogTranslationDraft(selectedPost.id, targetLocale);
        if (!createdDraft?.id) {
          throw new Error("Could not create the target translation draft.");
        }

        targetPost = {
          ...selectedPost,
          id: createdDraft.id,
          locale: targetLocale,
          slug: "",
          status: "draft",
          published_at: null,
          translated_from_id: selectedPost.id,
          translation_source_post_id: selectedPost.id,
        };
      }

      const translationResult = await translateBlogPostWithSeo({
        source_locale: selectedPost.locale || "ru",
        target_locale: targetLocale,
        fields: {
          title: selectedPost.title || "",
          excerpt: selectedPost.excerpt || "",
          content: selectedPost.content || "",
          seo_title: selectedPost.seo_title || selectedPost.title || "",
          seo_description: selectedPost.seo_description || selectedPost.excerpt || "",
          seo_keywords: selectedPost.seo_keywords || [],
          cover_image_alt: selectedPost.cover_image_alt || "",
        },
      });

      await updateBlogPost(targetPost.id, {
        title: translationResult?.fields?.title || "",
        slug: "",
        excerpt: translationResult?.fields?.excerpt || "",
        content: translationResult?.fields?.content || "",
        content_sections: targetPost.content_sections || selectedPost.content_sections || [],
        cover_image: targetPost.cover_image || selectedPost.cover_image || "",
        cover_image_alt: translationResult?.fields?.cover_image_alt || "",
        categories: targetPost.categories || selectedPost.categories || [],
        tags: targetPost.tags || selectedPost.tags || [],
        author_name: targetPost.author_name || selectedPost.author_name || "Fly Friendly",
        status: "draft",
        published_at: null,
        locale: targetLocale,
        read_time: targetPost.read_time || selectedPost.read_time || null,
        seo_title: translationResult?.fields?.seo_title || translationResult?.fields?.title || "",
        seo_description: translationResult?.fields?.seo_description || translationResult?.fields?.excerpt || "",
        seo_keywords: translationResult?.fields?.seo_keywords || [],
        canonical_override: "",
        translation_group_id: targetPost.translation_group_id || selectedPost.translation_group_id || null,
        translated_from_id: selectedPost.id,
        translation_source_post_id: selectedPost.id,
      });

      await loadModule({ nextSelectedId: targetPost.id });
      setPreviewOpen(true);
      setNotice(`Draft ${targetLocale.toUpperCase()} translation created via Google Translate. Review it before publishing.`);
    } catch (nextError) {
      setError(nextError.message || "Could not auto-translate the blog post.");
    } finally {
      setIsTranslating(false);
      setActiveActionId("");
    }
  };

  const handleCoverUpload = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    if (!canMutate) {
      setError("You do not have permission to upload blog images.");
      return;
    }

    setIsUploadingImage(true);
    setError("");
    setNotice("");

    try {
      const result = await uploadBlogImage({
        supabase,
        file,
        postId: draft.id || undefined,
      });
      setDraft((state) => ({
        ...state,
        cover_image: result.publicUrl,
      }));
      setNotice("Cover image uploaded.");
    } catch (nextError) {
      setError(nextError.message || "Could not upload the cover image.");
    } finally {
      setIsUploadingImage(false);
    }
  };

  const blogColumns = useMemo(() => ([
    {
      key: "title",
      label: t("admin.cms.columns.post"),
      width: 280,
      minWidth: 240,
      wrap: true,
      renderCell: (post) => (
        <div className="admin-crm-page__primary admin-blog-cms__table-title">
          <strong className="admin-crm-table__cell-main">{post.title || "Untitled post"}</strong>
          <span className="admin-crm-table__cell-sub">{post.slug ? `/${post.locale}/blog/${post.slug}` : "Slug not set"}</span>
        </div>
      ),
    },
    {
      key: "locale",
      label: t("admin.cms.columns.language"),
      width: 110,
      renderCell: (post) => <AdminStatusBadge tone="info">{post.locale || "en"}</AdminStatusBadge>,
    },
    {
      key: "status",
      label: t("admin.common.status"),
      width: 120,
      renderCell: (post) => <AdminStatusBadge tone={getStatusTone(post.status)}>{post.status || "draft"}</AdminStatusBadge>,
    },
    {
      key: "published_at",
      label: t("admin.cms.columns.published"),
      width: 150,
      renderCell: (post) => {
        const published = formatDateParts(post.published_at);
        return (
          <div className="admin-crm-page__date">
            <strong className="admin-crm-table__cell-main">{published.date}</strong>
            {published.time ? <span className="admin-crm-table__cell-sub">{published.time}</span> : null}
          </div>
        );
      },
    },
    {
      key: "updated_at",
      label: t("admin.common.updated"),
      width: 150,
      renderCell: (post) => {
        const updated = formatDateParts(post.updated_at);
        return (
          <div className="admin-crm-page__date">
            <strong className="admin-crm-table__cell-main">{updated.date}</strong>
            {updated.time ? <span className="admin-crm-table__cell-sub">{updated.time}</span> : null}
          </div>
        );
      },
    },
    {
      key: "seo",
      label: "SEO",
      width: 140,
      renderCell: (post) => (
        <AdminStatusBadge tone={getSeoTone(posts, post)}>
          {getSeoStatus(posts, post) === "complete" ? "Complete" : "Missing"}
        </AdminStatusBadge>
      ),
    },
    {
      key: "translations",
      label: t("admin.cms.columns.translations"),
      width: 170,
      renderCell: (post) => (
        <AdminStatusBadge tone={getTranslationTone(posts, post)}>
          {getGroupPosts(posts, post).length} linked / {getMissingTranslationLocales(posts, post).length} missing
        </AdminStatusBadge>
      ),
    },
    {
      key: "preview",
      label: t("admin.cms.columns.preview"),
      width: 100,
      align: "right",
      renderCell: (post) => post.slug ? (
        <a
          href={buildAbsoluteUrl(localizePath(`/blog/${post.slug}`, post.locale || "en"))}
          target="_blank"
          rel="noreferrer"
          className="admin-blog-cms__table-link"
          onClick={(event) => event.stopPropagation()}
        >
          <ExternalLink size={14} />
          <span>Open</span>
        </a>
      ) : "—",
    },
  ]), [posts, t]);

  return (
    <div className="admin-page admin-content-system-page admin-blog-cms-page">
      {error && <p className="admin-message is-error">{error}</p>}
      {notice && <p className="admin-message">{notice}</p>}
      {moduleData && !moduleData.supportsBlogModuleV1 && (
        <p className="admin-message admin-blog-cms__banner">
          Run `010_content_system_v1.sql` and `011_public_blog_management.sql` to enable the blog module.
        </p>
      )}
      {moduleData?.supportsBlogModuleV1 && moduleData?.supportsBlogSeoCmsV2 === false && (
        <p className="admin-message admin-blog-cms__banner">
          Run `048_blog_seo_cms_translation_support.sql` before editing posts with translations, SEO keywords, canonical override, or cover image alt.
        </p>
      )}

      {isLoading ? (
        <p className="admin-message">{t("admin.cms.loading")}</p>
      ) : (
        <>
          <section className="admin-crm-page__workspace admin-blog-cms__workspace">
            <AdminMetricsStrip
              items={metrics}
              actions={(
                <>
                  <button
                    type="button"
                    className="admin-btn admin-btn-secondary admin-link-button"
                    onClick={() => void loadModule({ nextSelectedId: selectedId })}
                    disabled={isLoading || isSaving}
                  >
                    <RefreshCw size={14} />
                    <span>{t("admin.common.refresh")}</span>
                  </button>
                  {canEdit ? (
                    <button
                      type="button"
                      className="admin-btn admin-btn-primary btn btn--primary"
                      onClick={startNewPost}
                      disabled={!canMutate}
                    >
                      <Plus size={14} />
                      <span>{t("admin.cms.newPost")}</span>
                    </button>
                  ) : null}
                </>
              )}
            />

            <AdminFilterBar
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder={t("admin.cms.searchPlaceholder")}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              statusOptions={[
                { value: "all", label: t("admin.cms.filters.allStatuses") },
                ...STATUS_OPTIONS.map((status) => ({ value: status, label: t(`admin.common.enums.${status}`, { defaultValue: status }) })),
              ]}
            >
              <select className="admin-filter-control admin-select" value={localeFilter} onChange={(event) => setLocaleFilter(event.target.value)}>
                <option value="all">{t("admin.cms.filters.allLanguages")}</option>
                {BLOG_LANGUAGE_OPTIONS.map((language) => (
                  <option value={language.code} key={language.code}>{language.nativeLabel}</option>
                ))}
              </select>

              <select className="admin-filter-control admin-select" value={seoFilter} onChange={(event) => setSeoFilter(event.target.value)}>
                <option value="all">{t("admin.cms.filters.allSeoStates")}</option>
                <option value="complete">{t("admin.cms.filters.seoComplete")}</option>
                <option value="missing">{t("admin.cms.filters.seoMissing")}</option>
              </select>

              <select className="admin-filter-control admin-select" value={translationFilter} onChange={(event) => setTranslationFilter(event.target.value)}>
                <option value="all">{t("admin.cms.filters.allTranslationStates")}</option>
                <option value="has">{t("admin.cms.filters.hasTranslations")}</option>
                <option value="missing">{t("admin.cms.filters.missingTranslations")}</option>
              </select>

              <button type="button" className="admin-btn admin-btn-secondary admin-crm-page__clear" onClick={() => {
                setSearch("");
                setStatusFilter("all");
                setLocaleFilter("all");
                setSeoFilter("all");
                setTranslationFilter("all");
              }}
              >
                <FilterX size={15} />
                <span>{t("admin.common.clearFilters")}</span>
              </button>
            </AdminFilterBar>

            <AdminColumnTable
              storageKey="ff-admin-table-layout-blog-cms"
              title={t("admin.cms.tableTitle")}
              countLabel={countLabel}
              columns={blogColumns}
              rows={filteredPosts}
              loading={isLoading}
              error={error}
              emptyTitle={t("admin.cms.emptyTitle")}
              emptyDetail={t("admin.cms.emptyDetail")}
              selectedRowId={selectedPost?.id || ""}
              getRowKey={(post) => post.id}
              onRowClick={(post) => openPostEditor(post.id)}
            />

            <AdminSidePanel
              open={previewOpen}
              eyebrow={t("admin.cms.editor.eyebrow")}
              title={editorTitle}
              subtitle={editorSubtitle}
              onClose={closePreview}
              className="admin-blog-cms-page__preview"
              withOverlay
              overlayClassName="admin-blog-cms-page__overlay"
              overlayLabel={t("admin.cms.editor.close")}
            >
              {!previewOpen ? null : (
                <div className="admin-blog-cms__preview-inner admin-leads-page__preview-inner">
                  <div className="admin-blog-cms__preview-scroll admin-leads-page__preview-scroll">
                    <section className="admin-blog-cms__identity admin-leads-page__identity">
                      <div>
                        <h4>{editorTitle}</h4>
                        <p>{editorSubtitle}</p>
                        <p>{publishedMeta}</p>
                      </div>
                      <div className="admin-blog-cms__identity-badges">
                        <AdminStatusBadge tone="info">{(draft.locale || "en").toUpperCase()}</AdminStatusBadge>
                        <AdminStatusBadge tone={getStatusTone(draft.status)}>{currentStatusLabel}</AdminStatusBadge>
                        <AdminStatusBadge tone={draftWarnings.length ? "warning" : "success"}>
                          {draftWarnings.length ? t("admin.cms.editor.seoMissing") : t("admin.cms.editor.seoReady")}
                        </AdminStatusBadge>
                        <AdminStatusBadge tone={groupPosts.length > 1 ? "success" : "warning"}>
                          {t("admin.cms.editor.translationCount", { count: groupPosts.length })}
                        </AdminStatusBadge>
                      </div>
                    </section>

                    <div className="admin-content-system__form admin-blog-cms__form">
                      <section className="admin-blog-cms__section admin-leads-page__section">
                        <div className="admin-blog-cms__section-head admin-leads-page__section-title">
                          <h4>{t("admin.cms.editor.sections.basic.title")}</h4>
                          <p>{t("admin.cms.editor.sections.basic.description")}</p>
                        </div>
                        <div className="admin-content-system__form-grid">
                          <div className="admin-content-system__field">
                            <label>{t("admin.cms.editor.fields.language")}</label>
                        <select value={draft.locale} disabled={!canMutate} onChange={(event) => setDraft((state) => ({ ...state, locale: event.target.value }))}>
                          {BLOG_LANGUAGE_OPTIONS.map((language) => (
                            <option key={language.code} value={language.code}>{language.nativeLabel}</option>
                          ))}
                        </select>
                          </div>
                          <div className="admin-content-system__field">
                            <label>{t("admin.common.status")}</label>
                        <select value={draft.status} disabled={!canMutate} onChange={(event) => setDraft((state) => ({ ...state, status: event.target.value }))}>
                          {STATUS_OPTIONS.map((status) => (
                            <option key={status} value={status}>{t(`admin.common.enums.${status}`, { defaultValue: status })}</option>
                          ))}
                        </select>
                          </div>
                          <div className="admin-content-system__field is-wide">
                            <label>{t("admin.cms.editor.fields.title")}</label>
                        <input
                          value={draft.title}
                          disabled={!canMutate}
                          onChange={(event) => setDraft((state) => ({
                            ...state,
                            title: event.target.value,
                            slug: state.slug || slugify(event.target.value),
                          }))}
                        />
                          </div>
                          <div className="admin-content-system__field">
                            <label>{t("admin.cms.editor.fields.slug")}</label>
                        <input value={draft.slug} disabled={!canMutate} onChange={(event) => setDraft((state) => ({ ...state, slug: event.target.value }))} />
                          </div>
                          <div className="admin-content-system__field">
                            <label>{t("admin.cms.editor.fields.author")}</label>
                        <input value={draft.author_name} disabled={!canMutate} onChange={(event) => setDraft((state) => ({ ...state, author_name: event.target.value }))} />
                          </div>
                          <div className="admin-content-system__field">
                            <label>{t("admin.cms.editor.fields.publishedDate")}</label>
                        <input type="datetime-local" value={draft.published_at} disabled={!canMutate} onChange={(event) => setDraft((state) => ({ ...state, published_at: event.target.value }))} />
                          </div>
                          <div className="admin-content-system__field is-wide">
                            <label>{t("admin.cms.editor.fields.excerpt")}</label>
                        <textarea value={draft.excerpt} disabled={!canMutate} onChange={(event) => setDraft((state) => ({ ...state, excerpt: event.target.value }))} />
                          </div>
                        </div>
                      </section>

                      <section className="admin-blog-cms__section admin-leads-page__section">
                        <div className="admin-blog-cms__section-head admin-leads-page__section-title">
                          <h4>{t("admin.cms.editor.sections.translations.title")}</h4>
                          <p>{t("admin.cms.editor.sections.translations.description")}</p>
                        </div>
                        <div className="admin-content-system__form-grid">
                          <div className="admin-content-system__field">
                            <label>{t("admin.cms.editor.fields.translationSource")}</label>
                        <select
                          value={draft.translation_source_post_id}
                          disabled={!canMutate}
                          onChange={(event) => setDraft((state) => ({ ...state, translation_source_post_id: event.target.value }))}
                        >
                          <option value="">{t("admin.cms.editor.notLinked")}</option>
                          {translationOptions.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                          </div>
                          <div className="admin-content-system__field">
                            <label>{t("admin.cms.editor.fields.translationGroup")}</label>
                            <input value={draft.translation_group_id || t("admin.cms.editor.translationGroupAuto")} disabled readOnly />
                          </div>
                          <div className="admin-content-system__field is-wide">
                            <label>{t("admin.cms.editor.fields.currentTranslations")}</label>
                            <div className="admin-blog-cms__translation-list">
                              {groupPosts.length ? groupPosts.map((post) => (
                                <span key={post.id} className="admin-content-system__badge">
                                  {post.locale} · {t(`admin.common.enums.${post.status || "draft"}`, { defaultValue: post.status || "draft" })}
                                </span>
                              )) : <span className="admin-content-system__badge">{t("admin.cms.editor.noLinkedTranslations")}</span>}
                            </div>
                          </div>
                        </div>

                        {selectedPost ? (
                          <PermissionGate anyPermissions={["blog.edit", "cms.edit"]}>
                            <div className="admin-blog-cms__translation-actions">
                              {translationActionLocales.length ? translationActionLocales.map((locale) => (
                                <button
                                  key={`translate-${locale}`}
                                  type="button"
                                  className="admin-btn admin-btn-secondary"
                                  disabled={activeActionId === selectedPost.id || isTranslating}
                                  onClick={() => autoTranslateToLocale(locale)}
                                >
                                  {isTranslating
                                    ? t("admin.cms.editor.translatingToLocale", { locale: locale.toUpperCase() })
                                    : t("admin.cms.editor.translateToLocale", { locale: locale.toUpperCase() })}
                                </button>
                              )) : null}
                              {translationActionLocales.length ? translationActionLocales.map((locale) => (
                                <button
                                  key={locale}
                                  type="button"
                                  className="admin-link-button"
                                  disabled={activeActionId === selectedPost.id}
                                  onClick={() => createTranslation(locale)}
                                >
                                  {t("admin.cms.editor.duplicateToLocale", { locale: locale.toUpperCase() })}
                                </button>
                              )) : <span className="admin-content-system__badge">{t("admin.cms.editor.allSeoTranslationsExist")}</span>}
                            </div>
                          </PermissionGate>
                        ) : null}
                      </section>

                      <section className="admin-blog-cms__section admin-leads-page__section">
                        <div className="admin-blog-cms__section-head admin-leads-page__section-title">
                          <h4>{t("admin.cms.editor.sections.cover.title")}</h4>
                          <p>{t("admin.cms.editor.sections.cover.description")}</p>
                        </div>
                        <div className="admin-content-system__form-grid">
                          <div className="admin-content-system__field is-wide">
                            <label>{t("admin.cms.editor.fields.coverImageUrl")}</label>
                        <input value={draft.cover_image} disabled={!canMutate} onChange={(event) => setDraft((state) => ({ ...state, cover_image: event.target.value }))} />
                          </div>
                          <div className="admin-content-system__field">
                            <label>{t("admin.cms.editor.fields.coverImageAlt")}</label>
                        <input value={draft.cover_image_alt} disabled={!canMutate} onChange={(event) => setDraft((state) => ({ ...state, cover_image_alt: event.target.value }))} />
                          </div>
                          <div className="admin-content-system__field">
                            <label>{t("admin.cms.editor.fields.uploadImage")}</label>
                            <label className={`admin-blog-cms__upload ${!canMutate ? "is-disabled" : ""}`}>
                          <Upload size={16} />
                          <span>{isUploadingImage ? t("admin.cms.editor.uploading") : t("admin.cms.editor.uploadHint", { size: Math.round(BLOG_IMAGE_MAX_FILE_SIZE / (1024 * 1024)) })}</span>
                          <input type="file" accept="image/jpeg,image/png,image/webp" disabled={!canMutate || isUploadingImage} onChange={handleCoverUpload} />
                            </label>
                          </div>
                        </div>
                      </section>

                      <section className="admin-blog-cms__section admin-leads-page__section is-wide">
                        <div className="admin-blog-cms__section-head admin-leads-page__section-title">
                          <h4>{t("admin.cms.editor.sections.content.title")}</h4>
                          <p>{t("admin.cms.editor.sections.content.description")}</p>
                        </div>
                      <SimpleRichTextEditor value={draft.content} disabled={!canMutate} onChange={(content) => setDraft((state) => ({ ...state, content }))} />
                      </section>

                      <section className="admin-blog-cms__section admin-leads-page__section">
                        <div className="admin-blog-cms__section-head admin-leads-page__section-title">
                          <h4>{t("admin.cms.editor.sections.seo.title")}</h4>
                          <p>{t("admin.cms.editor.sections.seo.description")}</p>
                        </div>
                        <div className="admin-content-system__form-grid">
                          <div className="admin-content-system__field">
                            <label>{t("admin.cms.editor.fields.seoTitle")}</label>
                        <input value={draft.seo_title} disabled={!canMutate} onChange={(event) => setDraft((state) => ({ ...state, seo_title: event.target.value }))} />
                        <small>{draft.seo_title.length}/60</small>
                          </div>
                          <div className="admin-content-system__field">
                            <label>{t("admin.cms.editor.fields.seoDescription")}</label>
                        <textarea value={draft.seo_description} disabled={!canMutate} onChange={(event) => setDraft((state) => ({ ...state, seo_description: event.target.value }))} />
                        <small>{draft.seo_description.length}/160</small>
                          </div>
                          <div className="admin-content-system__field">
                            <label>{t("admin.cms.editor.fields.seoKeywords")}</label>
                            <input value={draft.seo_keywords_input} disabled={!canMutate} onChange={(event) => setDraft((state) => ({ ...state, seo_keywords_input: event.target.value }))} placeholder={t("admin.cms.editor.placeholders.seoKeywords")} />
                          </div>
                          <div className="admin-content-system__field">
                            <label>{t("admin.cms.editor.fields.canonicalOverride")}</label>
                            <input value={draft.canonical_override} disabled={!canMutate} onChange={(event) => setDraft((state) => ({ ...state, canonical_override: event.target.value }))} placeholder="https://fly-friendly.com/en/blog/example" />
                          </div>
                        </div>

                        <div className="admin-blog-cms__preview-grid">
                          <div className="admin-blog-cms__preview-card">
                            <span className="admin-blog-cms__preview-label">{t("admin.cms.editor.preview.publicUrl")}</span>
                            <strong>{publicUrl || t("admin.cms.editor.preview.publicUrlEmpty")}</strong>
                          </div>
                          <div className="admin-blog-cms__preview-card">
                            <span className="admin-blog-cms__preview-label">{t("admin.cms.editor.preview.canonical")}</span>
                            <strong>{canonicalPreview || t("admin.cms.editor.preview.canonicalEmpty")}</strong>
                          </div>
                          <div className="admin-blog-cms__preview-card">
                            <span className="admin-blog-cms__preview-label">{t("admin.cms.editor.preview.robots")}</span>
                            <strong>{robotsPreview}</strong>
                          </div>
                          <div className="admin-blog-cms__preview-card">
                            <span className="admin-blog-cms__preview-label">{t("admin.cms.editor.preview.sitemap")}</span>
                            <strong>{isSitemapEligible ? t("admin.cms.editor.preview.sitemapIncluded") : t("admin.cms.editor.preview.sitemapExcluded")}</strong>
                          </div>
                        </div>

                        <div className="admin-blog-cms__google-preview">
                          <span className="admin-blog-cms__preview-label">{t("admin.cms.editor.preview.google")}</span>
                          <strong>{draft.seo_title || draft.title || t("admin.cms.editor.untitledArticle")}</strong>
                          <small>{publicUrl || "https://fly-friendly.com/en/blog/example"}</small>
                          <p>{draft.seo_description || draft.excerpt || t("admin.cms.editor.preview.googleEmpty")}</p>
                        </div>

                        <div className="admin-blog-cms__seo-notes">
                          <span className="admin-blog-cms__preview-label">{t("admin.cms.editor.preview.hreflang")}</span>
                          {hreflangPreview.length ? hreflangPreview.map((entry) => (
                            <small key={entry}>{entry}</small>
                          )) : <small>{t("admin.cms.editor.preview.noAlternates")}</small>}
                        </div>

                        <div className="admin-blog-cms__warning-list">
                          {draftWarnings.length ? draftWarnings.map((warning) => (
                            <span key={warning} className="admin-blog-cms__warning">{localizeBlogWarning(t, warning)}</span>
                          )) : <span className="admin-content-system__badge">{t("admin.cms.editor.seoLooksComplete")}</span>}
                          {missingTranslationLocales.length ? <span className="admin-blog-cms__warning">{t("admin.cms.editor.missingTranslations", { locales: missingTranslationLocales.join(", ") })}</span> : null}
                          {draft.status === "published" && !isSeoReady ? <span className="admin-blog-cms__warning">{t("admin.cms.editor.publishedSeoWarning")}</span> : null}
                        </div>
                      </section>

                      <div className="admin-content-system__actions admin-blog-cms__action-bar">
                        {draft.id ? (
                          <a
                            className="admin-btn admin-btn-secondary admin-link-button"
                            href={publicUrl || "#"}
                            target="_blank"
                            rel="noreferrer"
                            onClick={(event) => {
                              if (!publicUrl) {
                                event.preventDefault();
                              }
                            }}
                          >
                            <ExternalLink size={14} />
                            <span>{t("admin.cms.columns.preview")}</span>
                          </a>
                        ) : <span />}
                        <PermissionGate anyPermissions={["blog.edit", "cms.edit"]}>
                          <div className="admin-blog-cms__footer-actions">
                            {draft.id && draft.status === "published" ? (
                              <button className="admin-btn admin-btn-secondary" type="button" disabled={activeActionId === draft.id || !canMutate} onClick={() => updatePostStatus(selectedPost || draft, "draft")}>
                                {t("admin.cms.editor.unpublish")}
                              </button>
                            ) : null}
                            {draft.id ? (
                              <button className="admin-btn admin-btn-danger" type="button" disabled={activeActionId === draft.id || !canMutate} onClick={() => removePost(selectedPost || draft)}>
                                {t("admin.common.delete")}
                              </button>
                            ) : null}
                            <button className="btn btn--primary" type="button" disabled={isSaving || !canMutate} onClick={savePost}>
                              {isSaving ? t("admin.common.saving") : t("admin.cms.editor.save")}
                            </button>
                          </div>
                        </PermissionGate>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </AdminSidePanel>
          </section>
        </>
      )}
    </div>
  );
}

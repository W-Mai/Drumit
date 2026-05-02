export type Locale = "zh" | "en";

export type Dict = Record<string, string>;

export const LOCALE_OPTIONS: { value: Locale; label: string }[] = [
  { value: "zh", label: "中文" },
  { value: "en", label: "English" },
];

const zh: Dict = {
  // Header
  "header.open_docs": "打开文档列表",
  "header.docs": "文档",
  "header.github": "GitHub 源码",
  "header.blog": "博客 · benign.host",
  "header.blog_short": "博客",
  "header.about": "关于",
  "header.reset": "重置",
  "header.reset_confirm_title": "重置所有文档？",
  "header.reset_confirm_message":
    "所有保存过的编辑都会丢失，当前所有文档都会被替换为示例。",
  "header.reset_confirm_label": "重置",
  "header.mobile_docs_title": "文档列表",
  "header.close_docs": "关闭文档列表",
  "header.theme": "主题",
  "header.locale": "语言",

  // Dialog defaults
  "dialog.confirm": "确定",
  "dialog.cancel": "取消",

  // Export / Import errors
  "export.empty_title": "无法导出",
  "export.empty_message": "这个文档是空的，没有可导出的内容。",
  "import.failed_title": "导入失败",
  "import.failed_message": "文件无法被识别为 .drumtab 文档。",

  // Preview toolbar
  "preview.show_labels": "显示乐器名",
  "preview.hide_labels": "隐藏乐器名",

  // PadEditor prompts
  "editor.rename_section_title": "重命名段落",
  "editor.rename_section_message": "给当前段落起个新名字。",
  "editor.new_section_title": "新段落",
  "editor.new_section_message": "在当前 bar 之后起一个新段落。",
  "editor.section_name_placeholder": "段落名（如 Chorus）",
  "editor.name_required": "名字不能为空",

  // DocumentList prompts
  "doclist.rename_title": "重命名文档",
  "doclist.rename_message": "给这个文档换个名字吧。",
  "doclist.new_title": "新建文档",
  "doclist.new_message": "给新文档起个名字。",
  "doclist.new_placeholder": "文档名",
  "doclist.delete_title": "删除文档？",
  "doclist.delete_message":
    "文档「{name}」会被永久删除，这个操作不能撤销。",
  "doclist.delete_confirm": "删除",
  "doclist.import_failed_title": "导入失败",
  "doclist.import_failed_message": "无法读取这个 .drumtab 文件。",

  // About modal
  "about.title": "关于",
  "about.close": "关闭",
  "about.tagline_line1": "白天练，夜里扒，做梦都在找鼓点打。",
  "about.tagline_line2": "一个鼓谱工具，给不想啃五线谱的人。",
  "about.section.why": "为什么写这个",
  "about.why_body_1":
    "我不是专业鼓手，五线谱苦手，看到一堆线就晕。但我想扒歌、想练。",
  "about.why_body_2_pre":
    "Drumit 的思路：镲类一行、鼓类一行；声部撞了才多拆几行；符干省掉。源文件叫 ",
  "about.why_body_2_post": "，纯文本，能 diff、能 copy-paste、能提 PR。",
  "about.section.thanks": "鸣谢",
  "about.thanks_teacher_name": "董波老师",
  "about.thanks_body":
    "。Drumit 采用的这套两行压缩鼓谱记法 —— 镲类在上、鼓类在下、符干全省、一拍切若干格 —— 正是我在小米音乐社团跟董老师学打鼓时记下来的那套东西。他的谱面简单、直接、好读，真正做到了拿起就能打。这个项目本质上就是想把那种手写谱的体验搬到屏幕上。",
  "about.section.build": "构建信息",
  "about.build.version": "版本",
  "about.build.commit": "提交",
  "about.build.time": "构建时间",
  "about.section.links": "相关链接",
  "about.link.repo": "源码仓库 · GitHub",
  "about.link.changelog": "更新日志 · CHANGELOG",
  "about.link.license": "协议 · MIT",
};

const en: Dict = {
  "header.open_docs": "Open document list",
  "header.docs": "Documents",
  "header.github": "GitHub source",
  "header.blog": "Blog · benign.host",
  "header.blog_short": "Blog",
  "header.about": "About",
  "header.reset": "Reset",
  "header.reset_confirm_title": "Reset all documents?",
  "header.reset_confirm_message":
    "All saved edits will be lost. Every document will be replaced with the built-in examples.",
  "header.reset_confirm_label": "Reset",
  "header.mobile_docs_title": "Document list",
  "header.close_docs": "Close document list",
  "header.theme": "Theme",
  "header.locale": "Language",

  "dialog.confirm": "OK",
  "dialog.cancel": "Cancel",

  "export.empty_title": "Cannot export",
  "export.empty_message": "This document is empty — nothing to export.",
  "import.failed_title": "Import failed",
  "import.failed_message": "The file was not recognized as a .drumtab document.",

  "preview.show_labels": "Show instrument names",
  "preview.hide_labels": "Hide instrument names",

  "editor.rename_section_title": "Rename section",
  "editor.rename_section_message": "Give this section a new name.",
  "editor.new_section_title": "New section",
  "editor.new_section_message": "Start a new section after the current bar.",
  "editor.section_name_placeholder": "Section name (e.g. Chorus)",
  "editor.name_required": "Name cannot be empty",

  "doclist.rename_title": "Rename document",
  "doclist.rename_message": "Give this document a new name.",
  "doclist.new_title": "New document",
  "doclist.new_message": "Give the new document a name.",
  "doclist.new_placeholder": "Document name",
  "doclist.delete_title": "Delete document?",
  "doclist.delete_message":
    "“{name}” will be permanently deleted. This cannot be undone.",
  "doclist.delete_confirm": "Delete",
  "doclist.import_failed_title": "Import failed",
  "doclist.import_failed_message": "Could not read this .drumtab file.",

  "about.title": "About",
  "about.close": "Close",
  "about.tagline_line1":
    "Practice by day, transcribe by night, dream the beat all the time.",
  "about.tagline_line2":
    "A drum-tab tool for people who don’t want to wrestle with staff notation.",
  "about.section.why": "Why this exists",
  "about.why_body_1":
    "I'm not a pro drummer. Staff notation makes my eyes glaze over. But I still want to cop licks and practice.",
  "about.why_body_2_pre":
    "Drumit's idea: cymbals on one row, drums on another; split extra rows only when voices collide; drop the stems. The source file is plain ",
  "about.why_body_2_post": " text — diff-friendly, copy-paste-friendly, PR-friendly.",
  "about.section.thanks": "Thanks",
  "about.thanks_teacher_name": "Dong Bo",
  "about.thanks_body":
    ". The two-row compressed drum-tab notation used by Drumit — cymbals above, drums below, no stems, one beat split into grids — is exactly what I scribbled down while studying with Mr. Dong at the Xiaomi music club. His charts are simple, direct, and playable at sight. This project is basically an attempt to port that handwritten-tab feel to the screen.",
  "about.section.build": "Build info",
  "about.build.version": "Version",
  "about.build.commit": "Commit",
  "about.build.time": "Built at",
  "about.section.links": "Links",
  "about.link.repo": "Source · GitHub",
  "about.link.changelog": "Changelog",
  "about.link.license": "License · MIT",
};

export const dict: Record<Locale, Dict> = { zh, en };

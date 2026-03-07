/**
 * Prompt Templates Hook
 * 
 * 提供常用的 AI 图片生成 Prompt 模板，帮助用户快速创建高质量图片。
 */

export type TemplateCategory = 
  | 'all'
  | 'portrait'
  | 'landscape'
  | 'concept'
  | 'product'
  | 'illustration'
  | 'photography'
  | 'anime';

export interface PromptTemplate {
  id: string;
  name: string;
  category: TemplateCategory;
  description: string;
  template: string;
  example?: string;
  tags: string[];
}

export const PROMPT_TEMPLATES: PromptTemplate[] = [
  // 人像
  {
    id: 'portrait-1',
    name: '专业人像',
    category: 'portrait',
    description: '专业摄影风格的人物肖像',
    template: 'Professional portrait of {subject}, {lighting} lighting, {style} style, {mood} mood, high quality, detailed facial features, {background} background, shot with {camera}, {lens} lens, {composition}',
    example: 'Professional portrait of a young woman, soft natural lighting, elegant style, contemplative mood, high quality, detailed facial features, blurred garden background, shot with Canon EOS R5, 85mm lens, rule of thirds composition',
    tags: ['portrait', 'professional', 'photography'],
  },
  {
    id: 'portrait-2',
    name: '赛博朋克肖像',
    category: 'portrait',
    description: '霓虹灯下的未来主义赛博朋克风格',
    template: 'Cyberpunk portrait of {subject}, neon {color1} and {color2} lighting, futuristic city background, rain-slicked streets, holographic advertisements, high-tech implants, {accessories}, {mood} expression, cinematic, detailed, 8k',
    example: 'Cyberpunk portrait of a hacker, neon pink and blue lighting, futuristic city background, rain-slicked streets, holographic advertisements, high-tech eye implants, glowing tattoos, determined expression, cinematic, detailed, 8k',
    tags: ['cyberpunk', 'neon', 'futuristic', 'sci-fi'],
  },
  {
    id: 'portrait-3',
    name: '复古胶片',
    category: 'portrait',
    description: '模拟胶片摄影的温暖怀旧感',
    template: '{subject}, vintage film photography, {film_type} film, {color_tone} color grading, soft grain, {lighting} lighting, nostalgic atmosphere, {era} aesthetic, {mood} expression, bokeh background',
    example: 'Young couple in love, vintage film photography, Kodak Portra 400 film, warm color grading, soft grain, golden hour lighting, nostalgic atmosphere, 1970s aesthetic, happy expression, bokeh background',
    tags: ['vintage', 'film', 'nostalgic', 'warm'],
  },

  // 风景
  {
    id: 'landscape-1',
    name: '史诗风景',
    category: 'landscape',
    description: '壮观的自然风光摄影作品',
    template: 'Epic landscape of {location}, {time_of_day}, {weather} weather, {season} season, dramatic {sky_type} sky, {foreground} in foreground, {camera_angle} shot, {style} photography style, highly detailed, 8k resolution',
    example: 'Epic landscape of Icelandic waterfalls, golden hour, misty weather, autumn season, dramatic cloudy sky, colorful flowers in foreground, wide angle shot, National Geographic photography style, highly detailed, 8k resolution',
    tags: ['landscape', 'nature', 'epic', 'dramatic'],
  },
  {
    id: 'landscape-2',
    name: '极简风景',
    category: 'landscape',
    description: '简约构图的宁静风景',
    template: 'Minimalist landscape, {subject}, {color_palette} color palette, clean composition, negative space, {time_of_day}, serene atmosphere, soft gradients, {style} aesthetic, peaceful, meditative',
    example: 'Minimalist landscape, lone tree on horizon, pastel pink and blue color palette, clean composition, negative space, sunrise, serene atmosphere, soft gradients, Japanese aesthetic, peaceful, meditative',
    tags: ['minimalist', 'zen', 'peaceful', 'clean'],
  },
  {
    id: 'landscape-3',
    name: '科幻场景',
    category: 'landscape',
    description: '外星球或未来世界的奇幻景观',
    template: 'Alien landscape on {planet_type}, {sky_color} sky with {celestial_objects}, strange {vegetation} vegetation, {terrain} terrain, {atmosphere} atmosphere, sci-fi concept art, highly detailed, dramatic lighting, cinematic',
    example: 'Alien landscape on desert planet, purple sky with twin moons, strange crystalline vegetation, rocky canyon terrain, thin atmosphere, sci-fi concept art, highly detailed, dramatic lighting, cinematic',
    tags: ['sci-fi', 'alien', 'fantasy', 'concept art'],
  },

  // 概念艺术
  {
    id: 'concept-1',
    name: '概念角色',
    category: 'concept',
    description: '游戏或电影角色概念设计',
    template: 'Concept art of {character_type}, {style} style, {color_scheme} color scheme, {materials} materials, {weapons_or_items}, {pose} pose, highly detailed, {background} background, artstation, trending on artstation',
    example: 'Concept art of a fantasy knight, realistic style, dark silver and gold color scheme, weathered steel and leather materials, glowing runic sword, heroic standing pose, highly detailed, castle courtyard background, artstation, trending on artstation',
    tags: ['concept art', 'character', 'game', 'fantasy'],
  },
  {
    id: 'concept-2',
    name: '建筑设计',
    category: 'concept',
    description: '未来主义或幻想建筑设计',
    template: 'Architectural design of {building_type}, {style} architecture, {materials} materials, {environment} environment, {time_of_day}, {atmosphere} atmosphere, photorealistic rendering, detailed textures, {camera_angle} view',
    example: 'Architectural design of a floating sky city, futuristic organic architecture, glass and living plant materials, among the clouds environment, sunset, ethereal atmosphere, photorealistic rendering, detailed textures, aerial view',
    tags: ['architecture', 'concept', 'futuristic', 'design'],
  },

  // 产品摄影
  {
    id: 'product-1',
    name: '产品展示',
    category: 'product',
    description: '专业产品摄影效果',
    template: 'Product photography of {product}, {material} material, {background} background, {lighting} lighting, {style} style, professional studio setup, sharp focus, detailed texture, commercial photography, {angle} angle',
    example: 'Product photography of a luxury watch, brushed titanium material, dark gradient background, dramatic side lighting, minimalist style, professional studio setup, sharp focus, detailed texture, commercial photography, 3/4 angle',
    tags: ['product', 'commercial', 'studio', 'professional'],
  },
  {
    id: 'product-2',
    name: '生活方式',
    category: 'product',
    description: '融入生活场景的产品展示',
    template: 'Lifestyle product photography, {product} in {scene}, {mood} mood, {time_of_day} natural lighting, {color_palette} color palette, authentic moment, shallow depth of field, {style} aesthetic',
    example: 'Lifestyle product photography, coffee cup in cozy reading nook, warm and relaxed mood, morning natural lighting, warm earth tone color palette, authentic moment, shallow depth of field, hygge aesthetic',
    tags: ['lifestyle', 'product', 'natural', 'authentic'],
  },

  // 插画
  {
    id: 'illustration-1',
    name: '儿童绘本',
    category: 'illustration',
    description: '温暖可爱的儿童绘本风格',
    template: "Children's book illustration of {subject}, {art_style} style, {color_palette} colors, whimsical and charming, {setting} setting, {mood} mood, storybook quality, detailed, {character_type} character",
    example: "Children's book illustration of a curious fox, watercolor style, soft pastel colors, whimsical and charming, enchanted forest setting, adventurous mood, storybook quality, detailed, anthropomorphic character",
    tags: ['illustration', 'children', 'whimsical', 'storybook'],
  },
  {
    id: 'illustration-2',
    name: '技术图解',
    category: 'illustration',
    description: '清晰精确的技术说明图',
    template: 'Technical illustration of {subject}, {style} style, {view_type} view, cutaway showing {internal_details}, annotations and labels, blueprint aesthetic, precise linework, {color_scheme} color scheme, educational',
    example: 'Technical illustration of a mechanical watch movement, exploded view, multiple angles view, cutaway showing gear mechanisms, annotations and labels, blueprint aesthetic, precise linework, monochrome with gold accents color scheme, educational',
    tags: ['technical', 'illustration', 'blueprint', 'educational'],
  },

  // 摄影风格
  {
    id: 'photography-1',
    name: '街头摄影',
    category: 'photography',
    description: '捕捉城市生活瞬间',
    template: 'Street photography, {subject} in {location}, {time_of_day}, {weather} conditions, {mood} atmosphere, candid moment, {camera_type} camera aesthetic, {film_type} film look, {composition} composition',
    example: 'Street photography, jazz musician in New York subway, late evening, rainy conditions, moody atmosphere, candid moment, Leica M camera aesthetic, Ilford HP5 film look, leading lines composition',
    tags: ['street', 'urban', 'candid', 'documentary'],
  },
  {
    id: 'photography-2',
    name: '微距摄影',
    category: 'photography',
    description: '极致细节的微观世界',
    template: 'Macro photography of {subject}, extreme close-up, {texture} texture, {color_palette} colors, {lighting} lighting, shallow depth of field, abstract patterns, highly detailed, {mood} mood',
    example: 'Macro photography of morning dew on spider web, extreme close-up, delicate crystalline texture, rainbow iridescent colors, backlighting lighting, shallow depth of field, abstract patterns, highly detailed, serene mood',
    tags: ['macro', 'close-up', 'abstract', 'detailed'],
  },

  // 动漫风格
  {
    id: 'anime-1',
    name: '动漫角色',
    category: 'anime',
    description: '日式动漫风格角色',
    template: 'Anime style {character_type}, {hair_color} hair, {eye_color} eyes, {expression} expression, wearing {outfit}, {setting} background, {studio} art style, vibrant colors, detailed, {mood} atmosphere',
    example: 'Anime style schoolgirl character, pink hair, large purple eyes, cheerful expression, wearing sailor uniform, cherry blossom background, Kyoto Animation art style, vibrant colors, detailed, slice of life atmosphere',
    tags: ['anime', 'character', 'colorful', 'japanese'],
  },
  {
    id: 'anime-2',
    name: '机甲',
    category: 'anime',
    description: '巨型机甲机械设计',
    template: 'Mecha design, giant robot, {style} style, {color_scheme} color scheme, {weapons} weapons, {environment} environment, {pose} pose, detailed mechanical parts, {lighting} lighting, anime aesthetic',
    example: 'Mecha design, giant robot, realistic sci-fi style, white and blue color scheme, beam rifle and energy sword weapons, space colony environment, dynamic battle pose, detailed mechanical parts, dramatic rim lighting, anime aesthetic',
    tags: ['mecha', 'robot', 'sci-fi', 'action'],
  },
];

/**
 * 按分类筛选模板
 */
export function getTemplatesByCategory(category: TemplateCategory): PromptTemplate[] {
  if (category === 'all') {
    return PROMPT_TEMPLATES;
  }
  return PROMPT_TEMPLATES.filter((t) => t.category === category);
}

/**
 * 搜索模板
 */
export function searchTemplates(query: string): PromptTemplate[] {
  const lowerQuery = query.toLowerCase();
  return PROMPT_TEMPLATES.filter(
    (t) =>
      t.name.toLowerCase().includes(lowerQuery) ||
      t.description.toLowerCase().includes(lowerQuery) ||
      t.tags.some((tag) => tag.toLowerCase().includes(lowerQuery))
  );
}

/**
 * 填充模板变量
 * @param template 模板字符串
 * @param variables 变量对象
 */
export function fillTemplate(
  template: string,
  variables: Record<string, string>
): string {
  return template.replace(/\{(\w+)\}/g, (match, key) => {
    return variables[key] || match;
  });
}

/**
 * 获取分类标签
 */
export const CATEGORY_LABELS: Record<TemplateCategory, string> = {
  all: '全部',
  portrait: '人像',
  landscape: '风景',
  concept: '概念',
  product: '产品',
  illustration: '插画',
  photography: '摄影',
  anime: '动漫',
};

/**
 * Hook: usePromptTemplates
 * 
 * 使用示例:
 * ```tsx
 * const { templates, categories, selectedCategory, setSelectedCategory } = usePromptTemplates();
 * ```
 */
export function usePromptTemplates() {
  const categories = Object.entries(CATEGORY_LABELS).map(([key, label]) => ({
    key: key as TemplateCategory,
    label,
    count: key === 'all' 
      ? PROMPT_TEMPLATES.length 
      : PROMPT_TEMPLATES.filter((t) => t.category === key).length,
  }));

  return {
    templates: PROMPT_TEMPLATES,
    categories,
    getTemplatesByCategory,
    searchTemplates,
    fillTemplate,
    CATEGORY_LABELS,
  };
}

export default usePromptTemplates;

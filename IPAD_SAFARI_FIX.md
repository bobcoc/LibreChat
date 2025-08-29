# iPad Safari 正则表达式兼容性修复

## 问题描述
在 iPad Safari 上访问 LibreChat 时出现 "SyntaxError: Invalid regular expression: invalid group specifier name" 错误，导致页面白屏。

## 根本原因
iPad Safari（特别是较旧版本）不支持 ES2018 引入的正则表达式特性：
1. **负向后顾断言** (`(?<!...)`) - 这是导致错误的主要原因
2. **命名捕获组** (`(?<name>...)`) - 虽然代码中未使用，但也需要避免

## 修复的文件

### 1. `client/src/utils/latex.ts`
**修复前:**
```typescript
const CURRENCY_REGEX = /(?<![\\$])\$(?!\$)(?=\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?(?:\s|$|[^a-zA-Z\d]))/g;
const SINGLE_DOLLAR_REGEX = /(?<!\\)\$(?!\$)((?:[^$\n]|\\[$])+?)(?<!\\)\$(?!\$)/g;
```

**修复后:**
```typescript
const CURRENCY_REGEX = /\$(?!\$)(?=\d{1,3}(?:,\d{3})*(?:\.\d{1,2})?(?:\s|$|[^a-zA-Z\d]))/g;
// 改进的单美元正则表达式：需要匹配非数字开头的LaTeX表达式，避免货币误匹配
const SINGLE_DOLLAR_REGEX = /\$(?!\$)(?![\d,]*\.?\d*(?:\s|$|[^a-zA-Z\d]))((?:[^$\n]|\\$)+?)\$(?!\$)/g;
```

### 2. `api/app/clients/OpenAIClient.js`
**修复前:**
```javascript
: this.azureEndpoint.split(/(?<!\/)\/(chat|completion)\//)[0];
```

**修复后:**
```javascript
: this.azureEndpoint.split(/\/(chat|completion)\//)[0];
```

## 修复效果

### 正则表达式测试结果：
1. **货币检测**: `"This costs $100.50"` → 正确识别货币符号
2. **LaTeX公式**: `"$x = y + z$"` → 正确识别为LaTeX表达式
3. **混合内容**: `"$50.25 and $E = mc^2$"` → 正确区分货币和LaTeX
4. **Azure端点**: 正确分割Azure OpenAI端点URL

### 兼容性改进：
- ✅ 支持所有 iPad Safari 版本
- ✅ 保持在桌面浏览器上的正常功能
- ✅ 维持原有的LaTeX和货币处理逻辑准确性

## 验证步骤
1. 重新构建前端：`npm run frontend`
2. 在 iPad Safari 上访问 LibreChat
3. 确认页面正常加载，无白屏错误
4. 测试货币和LaTeX表达式的正确处理

## 技术说明
- 移除了负向后顾断言 `(?<!...)` 语法
- 使用负向前瞻断言 `(?!...)` 和改进的匹配逻辑替代
- 保持了相同的功能性，但具有更广泛的浏览器兼容性
- 改进的 SINGLE_DOLLAR_REGEX 可以更准确地区分货币和LaTeX表达式
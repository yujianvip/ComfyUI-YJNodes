$ErrorActionPreference = 'Stop'
$source = 'C:\Users\Administrator\Desktop\BUNNY_H3_高动态双采放大专属_FL2VA_REF2VA+.json'
$destination = Join-Path $PSScriptRoot 'BUNNY_H3_高动态双采放大专属_FL2VA_REF2VA+_紧密水平版.json'
$original = Get-Content -LiteralPath $source -Raw -Encoding UTF8 | ConvertFrom-Json
$workflow = Get-Content -LiteralPath $source -Raw -Encoding UTF8 | ConvertFrom-Json
# 只变更显示布局；宽度明显冗余的 LoRA 和采样节点收窄至 430。
$positions = @{
    62=@(0,-500); 64=@(2176,-500)
    4=@(0,100); 5=@(470,100); 32=@(940,100)
    3=@(0,307); 1=@(0,455); 2=@(0,555); 56=@(0,655)
    49=@(0,1100); 6=@(0,1842); 35=@(285,1842); 36=@(634,1842); 37=@(983,1842)
    27=@(0,2198); 30=@(340,2198); 29=@(710,2198); 11=@(0,2370); 55=@(0,2494)
    47=@(1440,453); 45=@(1910,453); 7=@(1440,660)
    8=@(2380,660); 9=@(2830,660); 10=@(2830,982); 12=@(3390,660)
    58=@(1440,1378); 57=@(1440,1780)
    54=@(3940,660); 13=@(4280,660); 59=@(3940,1200)
    48=@(5115,453); 46=@(5585,453); 14=@(5115,660)
    15=@(5585,660); 16=@(6095,660); 17=@(6785,660); 19=@(7225,660); 60=@(5115,1378)
    20=@(7775,660); 51=@(8315,660); 52=@(8635,660); 53=@(8910,660); 61=@(7775,1292)
}
if ($positions.Count -ne $workflow.nodes.Count) { throw '坐标表未覆盖全部节点。' }
foreach ($node in $workflow.nodes) {
    if (-not $positions.ContainsKey([int]$node.id)) { throw "缺少节点 $($node.id) 的坐标。" }
    $node.pos = $positions[[int]$node.id]
    if ($node.id -in @(45,46,47,48,12,19)) {
        $node.size = @(430,$node.size[1])
    }
}
$sections = @(
    @{id=20; title='01 · 模型加载｜上：大模型 · 中：CLIP · 下：VAE'; color='#47775b'; ids=@(4,5,32,3,1,2,56)},
    @{id=21; title='02 · 公共输入｜提示词、参考图、尺寸、时长与噪声'; color='#355f73'; ids=@(49,6,35,36,37,27,30,29,11,55)},
    @{id=22; title='03 · 一采｜专属 LoRA → 条件与采样计划 → 动作结构'; color='#645c8c'; ids=@(47,45,7,8,9,10,12,58,57)},
    @{id=23; title='04 · 潜空间放大｜一采结果 → 放大潜变量与目标尺寸'; color='#9a713d'; ids=@(54,13,59)},
    @{id=24; title='05 · 二采｜高分辨率条件 → 协调 → 细节与引导 → 重构'; color='#865582'; ids=@(48,46,14,15,16,17,19,60)},
    @{id=25; title='06 · 成片输出｜音视频解码 → 合成 → 清理 → 保存'; color='#355f73'; ids=@(20,51,52,53,61)},
    @{id=26; title='阅读说明｜整体从左向右；公共模型与素材跨阶段复用'; color='#555555'; ids=@(62,64)}
)
# 每组按原有左右次序压紧：普通节点净间距 20，模块边界间留 24。
# 同行节点与直接相连节点均保留向右约束；说明节点不占用主线列。
$cursor = 0.0
foreach ($section in $sections | Where-Object { $_.id -ne 26 }) {
    if ($section.id -eq 21) { $baseX = 0.0 } else { $baseX = $cursor }
    $members = @($workflow.nodes | Where-Object { $_.id -in $section.ids })
    $placed = @()
    foreach ($node in $members | Where-Object type -ne 'MarkdownNote' | Sort-Object { $_.pos[0] }, { $_.pos[1] }) {
        $x = $baseX
        foreach ($previous in $placed) {
            $sameBand = ($node.pos[1]-30 -lt $previous.pos[1]+$previous.size[1]) -and ($node.pos[1]+$node.size[1] -gt $previous.pos[1]-30)
            $connected = @($workflow.links | Where-Object { $_[1] -eq $previous.id -and $_[3] -eq $node.id }).Count -gt 0
            if ($sameBand -or $connected) { $x = [Math]::Max($x, $previous.pos[0]+$previous.size[0]+20) }
        }
        $node.pos = @($x,$node.pos[1])
        $placed += $node
    }
    foreach ($node in $members | Where-Object type -eq 'MarkdownNote') { $node.pos = @($baseX,$node.pos[1]) }
    $right = ($members | ForEach-Object { $_.pos[0]+$_.size[0] } | Measure-Object -Maximum).Maximum
    $cursor = [Math]::Max($cursor,$right+48)
}
$workflow.groups = @($sections | ForEach-Object {
    $section = $_
    $members = @($workflow.nodes | Where-Object { $_.id -in $section.ids })
    $left = ($members | ForEach-Object { $_.pos[0] } | Measure-Object -Minimum).Minimum - 12
    $top = ($members | ForEach-Object { $_.pos[1] } | Measure-Object -Minimum).Minimum - 68
    $right = ($members | ForEach-Object { $_.pos[0]+$_.size[0] } | Measure-Object -Maximum).Maximum + 12
    $bottom = ($members | ForEach-Object { $_.pos[1]+$_.size[1] } | Measure-Object -Maximum).Maximum + 12
    [pscustomobject]@{id=$section.id; title=$section.title; color=$section.color; font_size=24; flags=[pscustomobject]@{}; bounding=@($left,$top,($right-$left),($bottom-$top))}
})
$workflow.extra.ds.offset = @(100,600)
$workflow.extra.ds.scale = 0.16
$json = $workflow | ConvertTo-Json -Depth 100
[System.IO.File]::WriteAllText($destination, $json, [System.Text.UTF8Encoding]::new($false))
# 重新读取交付文件，排除显示布局字段后逐字比较规范化 JSON。
$verified = Get-Content -LiteralPath $destination -Raw -Encoding UTF8 | ConvertFrom-Json
foreach ($node in $verified.nodes) {
    $before = $original.nodes | Where-Object id -eq $node.id
    $node.pos = $before.pos
    $node.size = $before.size
}
$verified.groups = $original.groups
$verified.extra.ds = $original.extra.ds
if (($verified | ConvertTo-Json -Depth 100 -Compress) -cne ($original | ConvertTo-Json -Depth 100 -Compress)) {
    throw '验证失败：发现布局字段之外的变化。'
}
$nodes = $workflow.nodes
for ($i=0; $i -lt $nodes.Count; $i++) {
    for ($j=$i+1; $j -lt $nodes.Count; $j++) {
        $a=$nodes[$i]; $b=$nodes[$j]
        if (($a.pos[0] -lt $b.pos[0]+$b.size[0]) -and ($a.pos[0]+$a.size[0] -gt $b.pos[0]) -and
            ($a.pos[1]-30 -lt $b.pos[1]+$b.size[1]) -and ($a.pos[1]+$a.size[1] -gt $b.pos[1]-30)) {
            throw "节点重叠：$($a.id) 与 $($b.id)"
        }
    }
}
foreach ($link in $workflow.links) {
    $from = $nodes | Where-Object id -eq $link[1]
    $to = $nodes | Where-Object id -eq $link[3]
    if ($from.pos[0]+$from.size[0] -gt $to.pos[0]) { throw "连线未向右：$($link[0])" }
}
$mainRow = @(7,8,9,12,54,13,14,15,16,17,19,20,51,52,53)
foreach ($node in $nodes | Where-Object { $_.id -in $mainRow }) {
    if ($node.pos[1] -ne 660) { throw "主线节点未对齐：$($node.id)" }
}
Write-Output "已生成：$destination"
Write-Output "验证通过：44 个节点、61 条连线；所有连线从左向右；节点无重叠；除坐标、尺寸、分组和视角外全部数据一致。"

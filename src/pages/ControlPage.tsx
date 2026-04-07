import { motion } from 'framer-motion'
import { Sun, Zap, Battery, Settings } from 'lucide-react'
import ToggleSwitch from '../components/ToggleSwitch'
import { usePowerStationStore } from '../stores/powerStationStore'

export default function ControlPage() {
  const { powerStation, settings, togglePort, updateSettings, setChargeLimit } = usePowerStationStore()

  const outputPorts = powerStation.ports.filter(p => p.type === 'ac-out' || p.type === 'usb-out')

  return (
    <div className="h-full flex flex-col bg-[#000000] overflow-hidden">
      {/* Header */}
      <div className="px-5 pt-4 pb-4 safe-area-top">
        <h2 className="text-xl font-bold text-[#FFFFFF]">Output Control</h2>
        <p className="text-xs text-[#8E8E93] mt-1">Manage Charge / Discharge · Live Power Monitor</p>
      </div>

      {/* 可滚动内容 */}
      <div className="flex-1 overflow-y-auto scrollbar-hide px-5 pb-4">
        {/* 实时功率 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-br from-[rgba(1,214,190,0.06)] to-[rgba(52,199,89,0.04)]
                     border border-[rgba(1,214,190,0.2)] rounded-[28px] p-5 mb-4 relative overflow-hidden"
        >
          {/* 背景光晕 */}
          <div className="absolute -bottom-8 -right-8 w-[120px] h-[120px] rounded-full 
                        bg-[radial-gradient(circle,rgba(52,199,89,0.08),transparent_70%)]" />
          
          {/* 三列功率显示 */}
          <div className="flex justify-between mb-4">
            <div className="text-center flex-1">
              <div className="flex items-center justify-center gap-1.5">
                <Sun size={18} className="text-[#34C759]" />
                <span className="text-[22px] font-extrabold text-[#34C759] tracking-tight">
                  +{powerStation.inputPower}<small className="text-[13px] font-normal text-[#25A854]">W</small>
                </span>
              </div>
              <div className="text-[10px] text-[#8E8E93] mt-1 tracking-wide uppercase">Solar In</div>
            </div>
            <div className="w-px bg-[rgba(1,214,190,0.08)] my-1" />
            <div className="text-center flex-1">
              <div className="flex items-center justify-center gap-1.5">
                <Zap size={18} className="text-[#01D6BE]" />
                <span className="text-[22px] font-extrabold text-[#01D6BE] tracking-tight">
                  -{powerStation.outputPower}<small className="text-[13px] font-normal text-[#01A88F]">W</small>
                </span>
              </div>
              <div className="text-[10px] text-[#8E8E93] mt-1 tracking-wide uppercase">Output</div>
            </div>
            <div className="w-px bg-[rgba(1,214,190,0.08)] my-1" />
            <div className="text-center flex-1">
              <div className="flex items-center justify-center gap-1.5">
                <Battery size={18} className={powerStation.inputPower >= powerStation.outputPower ? 'text-[#FF9500]' : 'text-[#FF3B30]'} />
                {(() => {
                  const net = powerStation.inputPower - powerStation.outputPower
                  const color = net >= 0 ? '#FF9500' : '#FF3B30'
                  const label = net >= 0 ? `+${net}` : `${net}`
                  return (
                    <span className="text-[22px] font-extrabold tracking-tight" style={{ color }}>
                      {label}<small className="text-[13px] font-normal opacity-70">W</small>
                    </span>
                  )
                })()}
              </div>
              <div className="text-[10px] text-[#8E8E93] mt-1 tracking-wide uppercase">Net Charge</div>
            </div>
          </div>

          {/* 波形动画区域 */}
          <div className="h-12 rounded-lg bg-[rgba(0,0,0,0.15)] relative overflow-hidden">
            <svg className="w-full h-full" viewBox="0 0 750 48" preserveAspectRatio="none">
              <defs>
                <linearGradient id="waveGrad1" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#34C759" stopOpacity="0.4"/>
                  <stop offset="100%" stopColor="#34C759" stopOpacity="0"/>
                </linearGradient>
                <linearGradient id="waveGrad2" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#01D6BE" stopOpacity="0.3"/>
                  <stop offset="100%" stopColor="#01D6BE" stopOpacity="0"/>
                </linearGradient>
              </defs>
              {/* 输入波形 */}
              <g className="animate-wave">
                <path d="M0,28 C30,14 60,42 90,28 C120,14 150,38 180,24 C210,10 240,36 270,22 C300,8 330,34 360,20 C390,6 420,32 450,18 C480,4 510,30 540,16 C570,2 600,28 630,14 C660,0 690,26 720,12 L750,12 L750,48 L0,48Z" 
                      fill="url(#waveGrad1)"/>
                <path d="M0,28 C30,14 60,42 90,28 C120,14 150,38 180,24 C210,10 240,36 270,22 C300,8 330,34 360,20 C390,6 420,32 450,18 C480,4 510,30 540,16 C570,2 600,28 630,14 C660,0 690,26 720,12" 
                      fill="none" stroke="#34C759" strokeWidth="1.5" opacity="0.7"/>
              </g>
              {/* 输出波形 */}
              <g className="animate-wave" style={{ animationDelay: '-2s' }}>
                <path d="M0,34 C25,26 50,40 75,32 C100,24 125,38 150,30 C175,22 200,36 225,28 C250,20 275,34 300,26 C325,18 350,32 375,24" 
                      fill="none" stroke="#01D6BE" strokeWidth="1" opacity="0.5"/>
              </g>
            </svg>
          </div>
        </motion.div>

        {/* 输出端口控制 */}
        <div className="mb-4">
          <div className="text-[13px] font-bold text-[#8E8E93] tracking-wider uppercase mb-2.5">
            Output Ports
          </div>
          <div className="flex flex-col gap-2.5">
            {outputPorts.map((port) => (
              <div 
                key={port.id}
                className="bg-[#1C1C1E] border border-[rgba(1,214,190,0.08)] 
                         rounded-[20px] p-4 flex items-center gap-3.5"
              >
                <div className={`
                  w-11 h-11 rounded-[14px] flex items-center justify-center flex-shrink-0
                  ${port.type === 'ac-out' ? 'bg-[rgba(1,214,190,0.1)] text-[#01D6BE]' : ''}
                  ${port.type === 'usb-out' ? 'bg-[rgba(255,149,0,0.1)] text-[#FF9500]' : ''}
                `}>
                  {port.type === 'ac-out' ? <Zap size={20} /> : <Battery size={20} />}
                </div>
                <div className="flex-1">
                  <div className="text-sm font-semibold text-[#FFFFFF]">
                    {port.name}
                  </div>
                  <div className="text-[11px] text-[#8E8E93] mt-0.5">
                    {port.type === 'ac-out' ? '220V / 50Hz · Max 2000W' : '5V/9V/12V · Max 100W'}
                    {port.deviceName ? ` · ${port.deviceName}` : ''}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1.5">
                  <div className={`text-[15px] font-bold ${port.status === 'active' ? 'text-[#01D6BE]' : 'text-[#48484A]'}`}>
                    {port.status === 'active' ? `${port.power}W` : '—'}
                  </div>
                  <ToggleSwitch 
                    isOn={port.status === 'active'} 
                    onToggle={() => togglePort(port.id)}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 充电设置 */}
        <div className="bg-[#1C1C1E] border border-[rgba(1,214,190,0.08)] rounded-[20px] p-4 mb-4">
          <div className="flex items-center gap-2 text-sm font-bold text-[#FFFFFF] mb-3.5">
            <Settings size={14} className="flex-shrink-0" />
            CHARGE PROTECTION
          </div>
          
          <div className="space-y-3">
            <div className="flex justify-between items-center py-2 border-b border-[rgba(1,214,190,0.08)]">
              <div>
                <div className="text-[13px] text-[#AEAEB2]">Charge Mode</div>
                <div className="text-[10px] text-[#48484A] mt-0.5">Current: Standard</div>
              </div>
              <div className="text-[13px] font-semibold text-[#01D6BE]">Standard ▾</div>
            </div>
            
            <div className="flex justify-between items-center py-2 border-b border-[rgba(1,214,190,0.08)]">
              <div>
                <div className="text-[13px] text-[#AEAEB2]">Over-temp Protection</div>
                <div className="text-[10px] text-[#48484A] mt-0.5">Auto cut-off above 45°C</div>
              </div>
              <ToggleSwitch 
                isOn={settings.overTempProtection} 
                onToggle={() => updateSettings({ overTempProtection: !settings.overTempProtection })}
                size="sm"
              />
            </div>
            
            <div className="flex justify-between items-center py-2 border-b border-[rgba(1,214,190,0.08)]">
              <div>
                <div className="text-[13px] text-[#AEAEB2]">Over-discharge Protection</div>
                <div className="text-[10px] text-[#48484A] mt-0.5">Keep minimum 5% reserve</div>
              </div>
              <ToggleSwitch 
                isOn={settings.overDischargeProtection} 
                onToggle={() => updateSettings({ overDischargeProtection: !settings.overDischargeProtection })}
                size="sm"
              />
            </div>
            
            <div className="flex justify-between items-center py-2">
              <div>
                <div className="text-[13px] text-[#AEAEB2]">ECO Mode</div>
                <div className="text-[10px] text-[#48484A] mt-0.5">Auto sleep when load &lt;10W</div>
              </div>
              <ToggleSwitch 
                isOn={settings.ecoMode} 
                onToggle={() => updateSettings({ ecoMode: !settings.ecoMode })}
                size="sm"
              />
            </div>
          </div>

          {/* 充电限额滑块 */}
          <div className="mt-4">
            <div className="flex justify-between items-center mb-2.5">
              <span className="text-[13px] text-[#AEAEB2]">Charge Limit</span>
              <span className="text-base font-bold text-[#34C759]">{settings.chargeLimit}%</span>
            </div>
            <div className="relative h-5 flex items-center">
              {/* 轨道背景 */}
              <div className="absolute left-0 right-0 h-2 bg-[rgba(255,255,255,0.06)] rounded-full" />
              {/* 已填充部分 */}
              <div
                className="absolute left-0 h-2 rounded-full bg-gradient-to-r from-[#25A854] to-[#34C759]
                           shadow-[0_0_10px_rgba(52,199,89,0.3)] pointer-events-none"
                style={{ width: `${(settings.chargeLimit - 50) / 50 * 100}%` }}
              />
              {/* 拇指指示点：用 calc 避免边界溢出 */}
              <div
                className="absolute w-5 h-5 rounded-full bg-white border-2 border-[#34C759]
                           shadow-[0_0_10px_rgba(52,199,89,0.4),0_2px_6px_rgba(0,0,0,0.3)]
                           pointer-events-none"
                style={{
                  left: `calc(${(settings.chargeLimit - 50) / 50 * 100}% - 10px)`,
                  // 钳制在 [0, 轨道宽度-thumb宽度] 范围内通过 clamp
                }}
              />
              {/* 实际 input（透明，覆盖全区域） */}
              <input
                type="range"
                min="50"
                max="100"
                value={settings.chargeLimit}
                onChange={(e) => setChargeLimit(Number(e.target.value))}
                className="absolute inset-0 w-full opacity-0 cursor-pointer h-full"
              />
            </div>
            <div className="flex justify-between text-[10px] text-[#48484A] mt-1.5 px-0.5">
              <span>50%</span><span>60%</span><span>70%</span><span>80%</span><span>90%</span><span>100%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

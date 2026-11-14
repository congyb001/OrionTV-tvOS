require 'json'
package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name           = 'AVPlayerView'
  s.version        = package['version']
  s.summary        = package['description']
  s.description    = package['description']
  s.license        = ''
  s.author         = ''
  s.homepage       = 'https://github.com/congyb001/OrionTV-tvOS'
  s.platforms      = { :ios => '15.0', :tvos => '15.0' }
  s.source         = { :git => '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }
  s.swift_version = '5.4'

  s.source_files = "**/*.{h,m,mm,swift}"
end
